import { useCallback, useEffect, useState } from "react";
import type { BalancePresetsFile, BalanceTuning } from "@spaceship-defender/protocol";

import {
  BalanceRequestError,
  fetchBalance,
  fetchDefaults,
  saveBalance,
  validateBalance
} from "./balanceClient.js";
import { activePresetOf, withTuning } from "./model/tuning.js";
import { SCREENS, TABS, TAB_LABELS, type Tab } from "./screens/registry.js";

export function AdminApp() {
  const [balanceDocument, setBalanceDocument] = useState<BalancePresetsFile | null>(null);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("waves");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (secret: string) => {
    setBusy(true);
    setError(null);
    try {
      setBalanceDocument(await fetchBalance(secret));
      setDirty(false);
      setStatus("Загружено с сервера.");
    } catch (cause) {
      setError(cause instanceof BalanceRequestError ? cause.message : "Сервер недоступен.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const active = balanceDocument === null ? undefined : activePresetOf(balanceDocument);

  const updateTuning = (tuning: BalanceTuning): void => {
    if (balanceDocument === null) return;
    setBalanceDocument(withTuning(balanceDocument, tuning));
    setDirty(true);
    setStatus(null);
  };

  const updateDocument = (next: BalancePresetsFile): void => {
    setBalanceDocument(next);
    setDirty(true);
    setStatus(null);
  };

  const save = async (): Promise<void> => {
    if (balanceDocument === null) return;
    setBusy(true);
    setError(null);
    try {
      // Keep the edited values on screen when the server refuses them.
      setBalanceDocument(await saveBalance(password, balanceDocument));
      setDirty(false);
      setStatus("Сохранено. Новый бой стартует на этом балансе.");
    } catch (cause) {
      setError(cause instanceof BalanceRequestError ? cause.message : "Сохранить не удалось.");
    } finally {
      setBusy(false);
    }
  };

  const check = async (): Promise<void> => {
    if (balanceDocument === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await validateBalance(password, balanceDocument);
      if (result.valid) {
        setStatus("Проверка пройдена.");
      } else {
        setError(result.message ?? "Документ не прошёл проверку.");
      }
    } catch (cause) {
      setError(cause instanceof BalanceRequestError ? cause.message : "Проверить не удалось.");
    } finally {
      setBusy(false);
    }
  };

  const restoreDefaults = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setBalanceDocument(await fetchDefaults(password));
      setDirty(true);
      setStatus("Загружены встроенные значения. Сохраните, чтобы применить.");
    } catch (cause) {
      setError(cause instanceof BalanceRequestError ? cause.message : "Дефолты недоступны.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app">
      <header className="app__bar">
        <h1 className="app__title">Баланс SpaceShip Defender</h1>
        <label className="field field--inline">
          <span className="field__caption">Пароль</span>
          <input
            className="field__input"
            type="password"
            placeholder="только для удалённого доступа"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => {
            void load(password);
          }}
        >
          Перечитать
        </button>
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => {
            void check();
          }}
        >
          Проверить
        </button>
        <button
          className="button button--primary"
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            void save();
          }}
        >
          Сохранить
        </button>
        <button
          className="button button--ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            void restoreDefaults();
          }}
        >
          Встроенные значения
        </button>
      </header>

      {error !== null ? <p className="banner banner--error">{error}</p> : null}
      {status !== null ? <p className="banner banner--ok">{status}</p> : null}
      {dirty ? <p className="banner banner--warn">Есть несохранённые изменения.</p> : null}

      <nav className="tabs" aria-label="Разделы баланса" role="tablist">
        {TABS.map((candidate) => (
          <button
            className={`tabs__tab${candidate === tab ? " tabs__tab--active" : ""}`}
            data-testid={`admin-tab-${candidate}`}
            key={candidate}
            role="tab"
            aria-selected={candidate === tab}
            type="button"
            onClick={() => {
              setTab(candidate);
            }}
          >
            {TAB_LABELS[candidate]}
          </button>
        ))}
      </nav>

      <section data-testid={`admin-panel-${tab}`} role="tabpanel">
        {balanceDocument === null || active === undefined ? (
          <p className="empty">Баланс ещё не загружен.</p>
        ) : (
          SCREENS[tab]({
            document: balanceDocument,
            tuning: active.tuning,
            onTuningChange: updateTuning,
            onDocumentChange: updateDocument,
            onImportError: setError
          })
        )}
      </section>
    </main>
  );
}
