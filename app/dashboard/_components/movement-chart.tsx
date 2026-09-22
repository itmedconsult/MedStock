import type { DailyMovement } from "../_lib/dashboard-data";
import styles from "../dashboard.module.css";

export function MovementChart({ data }: { data: DailyMovement[] }) {
  const maximum = Math.max(1, ...data.flatMap((item) => [item.added, item.cut]));

  return (
    <div className={styles.chart} aria-label="Products added and cut stock by day">
      <div className={styles.chartScale} aria-hidden="true"><span>{maximum}</span><span>{Math.round(maximum / 2)}</span><span>0</span></div>
      <div className={styles.chartPlot}>
        <i className={styles.gridTop} /><i className={styles.gridMiddle} /><i className={styles.gridBottom} />
        {data.map((item) => (
          <div className={styles.chartDay} key={item.key} title={`${item.label}: added ${item.added}, cut ${item.cut}`}>
            <div className={styles.barPair}>
              <span className={styles.addedBar} style={{ height: `${Math.max(3, (item.added / maximum) * 100)}%` }}><b>{item.added || ""}</b></span>
              <span className={styles.cutBar} style={{ height: `${Math.max(3, (item.cut / maximum) * 100)}%` }}><b>{item.cut || ""}</b></span>
            </div>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
