import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBoard, validateBudget, validateTiles } from '../validation';
import { AppError } from '../errors';

function expectError(fn: () => unknown, code?: string): AppError {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof AppError, `期望 AppError，实际 ${String(err)}`);
    if (code) {
      assert.equal((err as AppError).code, code);
    }
    return err as AppError;
  }
  throw new Error('应当抛出错误');
}

test('颜色区分大小写且非空', () => {
  const a = validateTiles([{ id: '1', N: 'Red', E: 'red', S: 'r', W: 'r' }]);
  assert.notEqual(a[0].N, a[0].E);
  expectError(() => validateTiles([{ id: '1', N: '', E: 'r', S: 'r', W: 'r' }]));
});

test('重复方块编号被拒绝；同四边不同编号允许', () => {
  expectError(() =>
    validateTiles([
      { id: 'x', N: 'a', E: 'a', S: 'a', W: 'a' },
      { id: 'x', N: 'a', E: 'a', S: 'a', W: 'a' },
    ]),
  );
  assert.doesNotThrow(() =>
    validateTiles([
      { id: 'x', N: 'a', E: 'a', S: 'a', W: 'a' },
      { id: 'y', N: 'a', E: 'a', S: 'a', W: 'a' },
    ]),
  );
});

test('越界固定格与重复键被拒绝', () => {
  expectError(() => validateBoard({ rows: 1, cols: 1, fixed: { '1,0': 'x' } }));
  // 对象字面量无法有重复键，改为非法格式
  expectError(() => validateBoard({ rows: 1, cols: 1, fixed: { '0': 'x' } }));
});

test('固定编号不存在时在提供 tileIds 情况下被拒绝', () => {
  expectError(() =>
    validateBoard({ rows: 1, cols: 1, fixed: { '0,0': 'nope' } }, new Set(['a'])),
  );
});

test('边界数组长度不匹配被拒绝', () => {
  expectError(() =>
    validateBoard({ rows: 2, cols: 2, borders: { top: [null], right: [null, null], bottom: [null, null], left: [null, null] } }),
  );
});

test('网格上限：9x1 与 7x7 均拒绝', () => {
  expectError(() => validateBoard({ rows: 9, cols: 1 }));
  expectError(() => validateBoard({ rows: 7, cols: 7 }));
  assert.doesNotThrow(() => validateBoard({ rows: 6, cols: 6 }));
});

test('预算必须是正整数且有上限', () => {
  assert.equal(validateBudget(undefined), 50_000);
  assert.equal(validateBudget(10), 10);
  expectError(() => validateBudget(0));
  expectError(() => validateBudget(10_000_001));
});
