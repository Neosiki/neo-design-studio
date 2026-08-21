/**
 * schema.mjs — 의존성 없는 경량 JSON Schema 검증기
 *
 * 왜 ajv를 안 쓰나: `design check`는 npm install 없이도 어느 환경에서든 돌아야 한다.
 * 지원 키워드는 Design Studio 스키마가 실제로 쓰는 것만: type, const, enum, required,
 * properties, additionalProperties, items, minItems, minLength, minimum, maximum,
 * pattern, $ref(로컬 #/$defs), allOf, if/then/else, oneOf, anyOf, format(date-time/기타 경고).
 *
 * 반환: { valid, errors: [{ path, message }] }
 */

const FORMAT_CHECKS = {
  'date-time': (v) => !Number.isNaN(Date.parse(v)),
  uri: (v) => /^[a-z][a-z0-9+.-]*:/i.test(v),
};

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`지원하지 않는 $ref: ${ref}`);
  let node = root;
  for (const rawPart of ref.slice(2).split('/')) {
    const part = decodeURIComponent(rawPart.replace(/~1/g, '/').replace(/~0/g, '~'));
    node = node?.[part];
    if (node === undefined) throw new Error(`$ref를 찾을 수 없음: ${ref}`);
  }
  return node;
}

function check(value, schema, root, path, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push({ path, message: '이 위치에는 어떤 값도 허용되지 않습니다' });
    return;
  }

  if (schema.$ref) {
    check(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push({ path, message: `타입이 ${types.join('|')} 여야 하는데 ${typeOf(value)} 입니다` });
      return;
    }
  }

  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push({ path, message: `값이 ${JSON.stringify(schema.const)} 여야 합니다` });
  }

  if (schema.enum && !schema.enum.some((c) => JSON.stringify(c) === JSON.stringify(value))) {
    errors.push({ path, message: `허용값이 아닙니다. 가능: ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
  }

  const kind = typeOf(value);

  if (kind === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `최소 ${schema.minLength}자 이상이어야 합니다` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path, message: `최대 ${schema.maxLength}자까지 허용됩니다` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, message: `패턴 ${schema.pattern} 과 일치하지 않습니다` });
    }
    if (schema.format && FORMAT_CHECKS[schema.format] && !FORMAT_CHECKS[schema.format](value)) {
      errors.push({ path, message: `${schema.format} 형식이 아닙니다` });
    }
  }

  if (kind === 'number' || kind === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, message: `${schema.minimum} 이상이어야 합니다` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path, message: `${schema.maximum} 이하여야 합니다` });
    }
  }

  if (kind === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `최소 ${schema.minItems}개 이상이어야 합니다` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: `최대 ${schema.maxItems}개까지 허용됩니다` });
    }
    if (schema.items) {
      value.forEach((item, i) => check(item, schema.items, root, `${path}[${i}]`, errors));
    }
  }

  if (kind === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push({ path, message: `필수 항목 '${key}'가 없습니다` });
    }
    const props = schema.properties || {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) check(value[key], sub, root, path ? `${path}.${key}` : key, errors);
    }
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
      const patterns = Object.keys(schema.patternProperties || {}).map((p) => new RegExp(p));
      for (const key of Object.keys(value)) {
        if (key in props) continue;
        if (patterns.some((re) => re.test(key))) continue;
        if (schema.additionalProperties === false) {
          errors.push({ path: path ? `${path}.${key}` : key, message: '스키마에 없는 항목입니다' });
        } else {
          check(value[key], schema.additionalProperties, root, path ? `${path}.${key}` : key, errors);
        }
      }
    }
  }

  for (const sub of schema.allOf || []) check(value, sub, root, path, errors);

  if (schema.if) {
    const probe = [];
    check(value, schema.if, root, path, probe);
    const branch = probe.length === 0 ? schema.then : schema.else;
    if (branch) check(value, branch, root, path, errors);
  }

  if (schema.oneOf) {
    const passing = schema.oneOf.filter((sub) => {
      const probe = [];
      check(value, sub, root, path, probe);
      return probe.length === 0;
    });
    if (passing.length !== 1) {
      errors.push({ path, message: `oneOf 분기 중 정확히 하나를 만족해야 하는데 ${passing.length}개를 만족합니다` });
    }
  }

  if (schema.anyOf) {
    const ok = schema.anyOf.some((sub) => {
      const probe = [];
      check(value, sub, root, path, probe);
      return probe.length === 0;
    });
    if (!ok) errors.push({ path, message: 'anyOf 분기 중 어느 것도 만족하지 않습니다' });
  }
}

export function validate(value, schema) {
  const errors = [];
  try {
    check(value, schema, schema, '', errors);
  } catch (err) {
    errors.push({ path: '', message: err.message });
  }
  return { valid: errors.length === 0, errors };
}
