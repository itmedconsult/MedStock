import Link from "next/link";
import { IconClipboardCheck, IconPackageImport, IconScissors } from "@tabler/icons-react";
import styles from "./stock-workflow-nav.module.css";

type Workflow = "import" | "check" | "cut";

const workflows = [
  { id: "import" as const, href: "/import", label: "Import stock", detail: "Receive new items", icon: IconPackageImport },
  { id: "check" as const, href: "/check", label: "Check stock", detail: "Record physical count", icon: IconClipboardCheck },
  { id: "cut" as const, href: "/cut", label: "Cut stock", detail: "Sale or use inventory", icon: IconScissors },
];

export function StockWorkflowNav({ active }: { active: Workflow }) {
  return (
    <nav className={styles.nav} aria-label="Stock operations">
      <div className={styles.inner}>
        <span className={styles.label}>Stock operations</span>
        <div className={styles.links}>
          {workflows.map((workflow) => {
            const Icon = workflow.icon;
            return <Link key={workflow.id} href={workflow.href} className={active === workflow.id ? styles.active : ""} aria-current={active === workflow.id ? "page" : undefined}><Icon size={17} /><span><strong>{workflow.label}</strong><small>{workflow.detail}</small></span></Link>;
          })}
        </div>
      </div>
    </nav>
  );
}
