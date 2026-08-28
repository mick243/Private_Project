'use client';

import { useState } from 'react';
import type { Arcade, ArcadeInput, Machine } from '@/lib/types';
import type { Coord } from './MapPane';

interface Props {
  machines: Machine[];
  /** null 이면 신규 등록 */
  initial: Arcade | null;
  pickedCoord: Coord | null;
  picking: boolean;
  onTogglePick: () => void;
  onCoordChange: (coord: Coord) => void;
  onCancel: () => void;
  onSaved: (arcade: Arcade) => void;
}

/**
 * 고른 기종 하나. 대수는 별도 숫자가 아니라 cabinets 의 길이입니다 —
 * 대수와 컨디션 목록을 따로 들고 있으면 "3대인데 컨디션은 2개" 로 어긋납니다.
 */
interface MachineSelection {
  cabinets: { condition: number | null }[];
}

/** 한 오락실에 같은 게임 최대 대수 (lib/validation.ts 와 같은 값) */
const MAX_CABINETS = 20;

export default function ArcadeForm({
  machines,
  initial,
  pickedCoord,
  picking,
  onTogglePick,
  onCoordChange,
  onCancel,
  onSaved,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [is24h, setIs24h] = useState(initial?.is24h ?? false);
  const [openTime, setOpenTime] = useState(initial?.openTime ?? '');
  const [closeTime, setCloseTime] = useState(initial?.closeTime ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [selected, setSelected] = useState<Map<number, MachineSelection>>(
    () =>
      new Map(
        (initial?.machines ?? []).map((m) => [
          m.id,
          { cabinets: m.cabinets.map((c) => ({ condition: c.condition })) },
        ]),
      ),
  );

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const toggleMachine = (id: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { cabinets: [{ condition: null }] });
      return next;
    });
  };

  /** 대수 변경 — 늘어난 자리는 '모름'으로, 줄이면 뒤 호기부터 빠집니다 (서버와 같은 규칙) */
  const setCabinetCount = (id: number, raw: number) => {
    const count = Math.min(MAX_CABINETS, Math.max(1, Math.floor(raw) || 1));
    setSelected((prev) => {
      const cur = prev.get(id);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(id, {
        cabinets: Array.from({ length: count }, (_, i) => cur.cabinets[i] ?? { condition: null }),
      });
      return next;
    });
  };

  const setCabinetCondition = (id: number, index: number, condition: number | null) => {
    setSelected((prev) => {
      const cur = prev.get(id);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(id, {
        cabinets: cur.cabinets.map((c, i) => (i === index ? { condition } : c)),
      });
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    if (!pickedCoord) {
      setErrors(['지도에서 위치를 지정해 주세요']);
      return;
    }

    const payload: ArcadeInput = {
      name,
      address,
      lat: pickedCoord.lat,
      lng: pickedCoord.lng,
      openTime: is24h || !openTime ? null : openTime,
      closeTime: is24h || !closeTime ? null : closeTime,
      is24h,
      phone: phone || null,
      note: note || null,
      // 배열 순서가 그대로 1호기·2호기가 됩니다.
      machines: [...selected.entries()].map(([machineId, v]) => ({
        machineId,
        cabinets: v.cabinets,
      })),
    };

    setSaving(true);
    try {
      const res = await fetch(
        initial ? `/api/arcades/${initial.id}` : '/api/arcades',
        {
          method: initial ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.details ?? [data.error ?? '저장에 실패했습니다']);
        return;
      }
      onSaved(data.arcade as Arcade);
    } catch {
      setErrors(['네트워크 오류로 저장하지 못했습니다']);
    } finally {
      setSaving(false);
    }
  };

  const rhythm = machines.filter((m) => m.category === 'rhythm');
  const etc = machines.filter((m) => m.category === 'etc');

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2>{initial ? '오락실 수정' : '오락실 등록'}</h2>

      {errors.length > 0 && (
        <ul className="form-errors">
          {errors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      <label className="field">
        <span>이름 *</span>
        <input
          className="input-on-light"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </label>

      <label className="field">
        <span>주소 *</span>
        <input
          className="input-on-light"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={200}
          required
        />
      </label>

      <div className="field">
        <span>위치 *</span>
        <div className="coord-row">
          <button
            type="button"
            className={picking ? 'btn btn-on' : 'btn'}
            onClick={onTogglePick}
          >
            {picking ? '지도 클릭 대기중…' : '지도에서 위치 지정'}
          </button>
          <input
            type="number"
            step="0.000001"
            placeholder="위도"
            value={pickedCoord?.lat ?? ''}
            onChange={(e) =>
              onCoordChange({
                lat: Number(e.target.value),
                lng: pickedCoord?.lng ?? 0,
              })
            }
          />
          <input
            type="number"
            step="0.000001"
            placeholder="경도"
            value={pickedCoord?.lng ?? ''}
            onChange={(e) =>
              onCoordChange({
                lat: pickedCoord?.lat ?? 0,
                lng: Number(e.target.value),
              })
            }
          />
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={is24h} onChange={(e) => setIs24h(e.target.checked)} />
        <span>24시간 영업</span>
      </label>

      {!is24h && (
        <div className="field">
          <span>영업시간</span>
          <div className="coord-row">
            <input
              type="time"
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
            />
            <span className="tilde">~</span>
            <input
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
            />
          </div>
        </div>
      )}

      <label className="field">
        <span>전화번호</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="선택" />
      </label>

      <label className="field">
        <span>메모</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="층수, 배치 특징 등"
        />
      </label>

      <div className="field">
        <span>보유 기종 ({selected.size})</span>
        {[
          { title: '리듬게임', items: rhythm },
          { title: '기타', items: etc },
        ].map((group) => (
          <div key={group.title} className="machine-group">
            <h4>{group.title}</h4>
            <div className="machine-grid">
              {group.items.map((m) => {
                const sel = selected.get(m.id);
                return (
                  <div key={m.id} className={`machine-item ${sel ? 'is-on' : ''}`}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!sel}
                        onChange={() => toggleMachine(m.id)}
                      />
                      <span title={m.name}>{m.shortName}</span>
                    </label>
                    {sel && (
                      <>
                        <div className="machine-detail">
                          <label>
                            대수
                            <input
                              type="number"
                              min={1}
                              max={MAX_CABINETS}
                              value={sel.cabinets.length}
                              onChange={(e) => setCabinetCount(m.id, Number(e.target.value))}
                            />
                          </label>
                        </div>
                        {/* 대수만큼 컨디션 칸이 생깁니다 — 2대인데 한쪽만 상태가
                            나쁜 경우를 적을 자리가 있어야 합니다. */}
                        <div className="cabinet-fields">
                          {sel.cabinets.map((c, i) => (
                            <label key={i}>
                              {i + 1}호기
                              <select
                                value={c.condition ?? ''}
                                onChange={(e) =>
                                  setCabinetCondition(
                                    m.id,
                                    i,
                                    e.target.value ? Number(e.target.value) : null,
                                  )
                                }
                              >
                                <option value="">모름</option>
                                <option value="5">5 최상</option>
                                <option value="4">4 좋음</option>
                                <option value="3">3 보통</option>
                                <option value="2">2 나쁨</option>
                                <option value="1">1 심각</option>
                              </select>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '저장 중…' : initial ? '수정' : '등록'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          취소
        </button>
      </div>
    </form>
  );
}
