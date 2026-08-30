import type { BatchCell } from "@spaceship-defender/protocol";

import { buildLabel, cellLabel, economyByWave, upgradeRows } from "./aggregate.js";
import { LineChart } from "./charts/LineChart.js";

/** Where the credits went, and which upgrades the ballot actually bought. */
export function EconomySection({ cell }: { readonly cell: BatchCell }) {
  const upgrades = upgradeRows(cell);
  const bought = upgrades.reduce((sum, row) => sum + row.count, 0);
  const perRun = cell.completedRuns === 0 ? 0 : bought / cell.completedRuns;
  return (
    <section className="card">
      <h2>Экономика и апгрейды</h2>
      <LineChart title={`Кредиты по волнам — ${cellLabel(cell.key)}`} data={economyByWave(cell)} />
      <p className="hint">
        Покупка происходит в передышке, между двумя боевыми окнами, и записывается на волну, которая
        эти кредиты заработала. Первая волна почти никогда ничего не покупает: она приносит меньше
        цены апгрейда.
      </p>
      <div className="caps">
        <div className="stat">
          <span className="stat__value">{String(bought)}</span>
          <span>куплено апгрейдов</span>
        </div>
        <div className="stat">
          <span className="stat__value">{perRun.toFixed(1)}</span>
          <span>на прогон</span>
        </div>
        <div className="stat">
          <span className="stat__value">{String(cell.stats.creditsSpent)}</span>
          <span>кредитов потрачено</span>
        </div>
        <div className="stat">
          <span className="stat__value">{String(cell.splitVotes)}</span>
          <span>расхождений в голосах</span>
        </div>
      </div>

      {upgrades.length === 0 ? (
        <p className="hint">Ни одной покупки: кредитов не хватило либо прогоны кончились раньше.</p>
      ) : (
        <>
          <h3>Схемы прокачки, лучшие сверху</h3>
          <p className="hint">
            Карта тянется заново на каждой передышке и ничего не помнит о прошлых, так что один и
            тот же апгрейд может выпасть несколько раз за прогон — это видно по «×2» в схеме. Строка
            с одним прогоном — это анекдот, а не измерение; смотрите на колонку «прогонов».
          </p>
          <table className="entries">
            <thead>
              <tr>
                <th scope="col">Схема</th>
                <th scope="col">Прогонов</th>
                <th scope="col">Медиана волны</th>
                <th scope="col">Лучшая волна</th>
                <th scope="col">Медиана очков</th>
              </tr>
            </thead>
            <tbody>
              {cell.builds.map((row) => (
                <tr key={row.key}>
                  <td>{buildLabel(row.build)}</td>
                  <td>{row.runs}</td>
                  <td>{row.medianWave}</td>
                  <td>{row.bestWave}</td>
                  <td>{row.medianScore}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Вклад отдельного апгрейда</h3>
          <p className="hint">
            Куда доходили прогоны, купившие апгрейд, против тех, что его не купили. Грубее схем, но
            устойчивее: каждый прогон попадает ровно в одну из колонок.
          </p>
          <table className="entries">
            <thead>
              <tr>
                <th scope="col">Апгрейд</th>
                <th scope="col">Куплено</th>
                <th scope="col">Прогонов с ним</th>
                <th scope="col">Медиана волны с ним</th>
                <th scope="col">Прогонов без</th>
                <th scope="col">Медиана волны без</th>
              </tr>
            </thead>
            <tbody>
              {cell.upgradeImpact.map((row) => (
                <tr key={row.upgradeId}>
                  <td>{row.upgradeId}</td>
                  <td>{row.bought}</td>
                  <td>{row.runsWith}</td>
                  <td>{row.medianWaveWith}</td>
                  <td>{row.runsWithout}</td>
                  <td>{row.runsWithout === 0 ? "—" : row.medianWaveWithout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="hint">
        При экипаже из двух мест голоса расходятся один к одному, и ничью решает порядок карт —
        карта пилота выигрывает, карта щита проигрывает карте стрелка. Это свойство правил игры, а
        не бота.
      </p>
    </section>
  );
}
