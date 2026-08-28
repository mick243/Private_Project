'use client';

interface Props {
  /** null 이면 아직 평가 없음 */
  value: number | null;
  /** 넘기면 입력용, 없으면 표시용 */
  onChange?: (value: number) => void;
  disabled?: boolean;
}

const STARS = [1, 2, 3, 4, 5];

/** 표시할 때는 반올림해 채우고, 입력할 때는 정수 1~5 만 받는다. */
export default function StarRating({ value, onChange, disabled }: Props) {
  const filled = value === null ? 0 : Math.round(value);

  if (!onChange) {
    return (
      <span className="stars" aria-label={value === null ? '평가 없음' : `${value} / 5`}>
        {STARS.map((s) => (
          <i key={s} className={s <= filled ? 'star is-on' : 'star'}>
            ★
          </i>
        ))}
      </span>
    );
  }

  return (
    <span className="stars is-input">
      {STARS.map((s) => (
        <button
          key={s}
          type="button"
          className={s <= filled ? 'star is-on' : 'star'}
          disabled={disabled}
          onClick={() => onChange(s)}
          aria-label={`${s}점`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
