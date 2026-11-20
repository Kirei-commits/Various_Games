import { describe, expect, it } from 'vitest';
import { parseRoute } from './useRoute';

describe('parseRoute', () => {
  it('回とパートを読み取る', () => {
    expect(parseRoute('#/2/3')).toEqual({ lesson: 2, part: 3 });
  });

  it('パートが無ければ1つ目', () => {
    expect(parseRoute('#/4')).toEqual({ lesson: 4, part: 1 });
  });

  it('住所が無い・形がちがうときは「回は未指定」', () => {
    expect(parseRoute('')).toEqual({ lesson: null, part: 1 });
    expect(parseRoute('#top')).toEqual({ lesson: null, part: 1 });
  });
});
