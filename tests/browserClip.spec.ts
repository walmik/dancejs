// global.window = true;
import { recursivelyApplyPatternToDurations } from '../src/browserClip';
import { expandStr } from '../src/utils';

describe('../src/browserClip', () => {
  it('applies same duration to simple pattern', () => {
    expect(
      recursivelyApplyPatternToDurations(expandStr('xxxx'), 1)
    ).toStrictEqual([1, 1, 1, 1]);
  });

  it('split durations in subpattern', () => {
    expect(
      recursivelyApplyPatternToDurations(expandStr('x[xx]x'), 1)
    ).toStrictEqual([1, 0.5, 0.5, 1]);
  });

  it('split duration in subpattern to subpattern', () => {
    expect(
      recursivelyApplyPatternToDurations(expandStr('x[xxxx]x'), 1)
    ).toStrictEqual([1, 0.25, 0.25, 0.25, 0.25, 1]);
  });

  it('split duration in subpattern to subpattern', () => {
    expect(
      recursivelyApplyPatternToDurations(expandStr('x[x[xx]]x'), 1)
    ).toStrictEqual([1, 0.5, 0.25, 0.25, 1]);
  });

  it('is able to extend notes', () => {
    expect(
      recursivelyApplyPatternToDurations(expandStr('xx__x'), 1)
    ).toStrictEqual([1, 3, 1]);
  });

  it('is able to extend notes in subpattern', () => {
    expect(
      recursivelyApplyPatternToDurations(expandStr('x[x__-]x'), 1)
    ).toStrictEqual([1, 0.75, 1]);
  });
});