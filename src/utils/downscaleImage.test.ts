import { describe, it, expect } from 'vitest';
import { computeTargetSize, MAX_AVATAR_SIDE } from './downscaleImage';

describe('computeTargetSize', () => {
  it('большая картинка ужимается по длинной стороне с сохранением пропорций', () => {
    expect(computeTargetSize(4000, 3000)).toEqual({
      width: MAX_AVATAR_SIDE,
      height: (MAX_AVATAR_SIDE * 3000) / 4000,
    });
  });

  it('вертикальная ужимается по высоте', () => {
    expect(computeTargetSize(1000, 4000)).toEqual({
      width: (MAX_AVATAR_SIDE * 1000) / 4000,
      height: MAX_AVATAR_SIDE,
    });
  });

  it('маленькая картинка не увеличивается', () => {
    expect(computeTargetSize(200, 150)).toEqual({ width: 200, height: 150 });
  });

  it('картинка ровно по границе не трогается', () => {
    expect(computeTargetSize(MAX_AVATAR_SIDE, MAX_AVATAR_SIDE)).toEqual({
      width: MAX_AVATAR_SIDE,
      height: MAX_AVATAR_SIDE,
    });
  });
});
