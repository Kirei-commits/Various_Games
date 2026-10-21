"""Strategy & Analysis Layer のインターフェース（Strategy パターン）。"""

from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

from quant.domain.models import Direction


class Strategy(ABC):
    """新しいアルゴリズムはこのクラスを継承し generate_signals() を実装するだけで追加できる。

    契約:
      - 戻り値は data と同じ index を持つ int の Series で、値は -1 / 0 / 1（Direction）。
      - バー t の値は「バー t の終値までの情報だけ」で計算すること（先読み禁止）。
        実際の約定はエンジン側でバー t+1 の始値に行われる。
    """

    name: str = "base"

    @abstractmethod
    def generate_signals(self, data: pd.DataFrame) -> pd.Series:
        ...

    def __call__(self, data: pd.DataFrame) -> pd.Series:
        signals = self.generate_signals(data).reindex(data.index).fillna(0).astype(int)
        invalid = set(signals.unique()) - {d.value for d in Direction}
        if invalid:
            raise ValueError(f"{self.name}: 不正なシグナル値 {invalid}")
        return signals.rename("signal")

    def __repr__(self) -> str:
        params = ", ".join(f"{k}={v}" for k, v in vars(self).items())
        return f"{type(self).__name__}({params})"


def hold_between(entries: pd.Series, exits: pd.Series, value: int = 1) -> pd.Series:
    """エントリー条件〜エグジット条件の間ポジションを保持する状態系列を作るヘルパー。"""
    state = pd.Series(float("nan"), index=entries.index)
    state[exits.fillna(False).astype(bool)] = 0
    state[entries.fillna(False).astype(bool)] = value
    return state.ffill().fillna(0).astype(int)
