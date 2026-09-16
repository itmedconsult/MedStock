"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import Barcode from "react-barcode";
import { brotherPrinterConfig, printProductsToBrother } from "@/lib/brother-print";
import {
  IconBarcode,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconPackage,
  IconPhotoEdit,
  IconPill,
  IconSearch,
  IconStethoscope,
  IconVaccine,
  IconX,
} from "@tabler/icons-react";

type Product = {
  id: number;
  name: string;
  sku: string;
  date: string;
  quantity: number;
  initialQuantity: number;
  category: string;
  accent: string;
  tint: string;
  image?: string;
};

const seedProducts: Product[] = [
  { id: 1, name: "Paracetamol 500 mg", sku: "MED-PCM-500", date: "2026-09-16", quantity: 48, initialQuantity: 48, category: "Tablets", accent: "#2e7d6b", tint: "#e3f2ed" },
  { id: 2, name: "Amoxicillin 250 mg", sku: "MED-AMX-250", date: "2026-09-15", quantity: 24, initialQuantity: 24, category: "Capsules", accent: "#c58148", tint: "#faeee3" },
  { id: 3, name: "Insulin Glargine", sku: "MED-INS-100", date: "2026-09-16", quantity: 12, initialQuantity: 12, category: "Injection", accent: "#5b78a6", tint: "#e7edf7" },
  { id: 4, name: "Surgical Masks", sku: "SUP-MSK-050", date: "2026-09-14", quantity: 96, initialQuantity: 96, category: "Supplies", accent: "#735f9b", tint: "#eeeaf5" },
  { id: 5, name: "Vitamin C 1000 mg", sku: "MED-VTC-1K", date: "2026-09-13", quantity: 36, initialQuantity: 36, category: "Supplements", accent: "#b26d55", tint: "#f9eae4" },
  { id: 6, name: "Digital Thermometer", sku: "DEV-THM-001", date: "2026-09-12", quantity: 18, initialQuantity: 18, category: "Devices", accent: "#367b8a", tint: "#e2f0f3" },
];

function ProductArtwork({ product }: { product: Product }) {
  if (product.image) return <img className="product-image" src={product.image} alt={product.name} />;
  const Icon = product.category === "Injection" ? IconVaccine : product.category === "Devices" ? IconStethoscope : product.category === "Supplies" ? IconPackage : IconPill;
  return (
    <div className="product-art" style={{ background: product.tint, color: product.accent }}>
      <span className="art-orbit orbit-one" />
      <span className="art-orbit orbit-two" />
      <Icon size={58} stroke={1.35} />
      <span className="art-label">{product.category}</span>
    </div>
  );
}

export default function InventoryPage() {
  const [products, setProducts] = useState(seedProducts);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [printStatus, setPrintStatus] = useState<"idle" | "printing" | "success" | "error">("idle");
  const [printMessage, setPrintMessage] = useState("");
  const [toast, setToast] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => products.filter((product) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term) || product.category.toLowerCase().includes(term);
    return matchesSearch && (!date || product.date === date);
  }), [products, search, date]);

  const barcodeProducts = useMemo(
    () => products.filter((product) => product.quantity > 0),
    [products],
  );

  const adjustQuantity = (id: number, amount: number) => {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, quantity: Math.max(0, product.quantity + amount) } : product));
  };

  const changeImage = (id: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const image = URL.createObjectURL(file);
    setProducts((current) => current.map((product) => product.id === id ? { ...product, image } : product));
  };

  const clearAll = () => {
    setSearch("");
    setDate("");
    setProducts((current) => current.map((product) => ({ ...product, quantity: 0 })));
    setToast(true);
    window.setTimeout(() => setToast(false), 2200);
  };

  const closeBarcodeModal = () => {
    if (printStatus === "printing") return;
    setIsBarcodeModalOpen(false);
    setPrintStatus("idle");
    setPrintMessage("");
  };

  const printWithBrother = async () => {
    setPrintStatus("printing");
    setPrintMessage("Sending labels to Brother QL-820NWB…");
    try {
      await printProductsToBrother(barcodeProducts);
      setPrintStatus("success");
      setPrintMessage("Labels sent to Brother QL-820NWB successfully.");
    } catch (error) {
      setPrintStatus("error");
      setPrintMessage(error instanceof Error ? error.message : "Unable to print to Brother QL-820NWB.");
    }
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark"><IconPill size={22} /></span>
          <span>Med<span>Stock</span></span>
        </a>
        <div className="header-status"><span className="status-dot" />Inventory system online</div>
        <button className="avatar" aria-label="Account menu">MS</button>
      </header>

      <section className="hero">
        <p className="eyebrow">Medical inventory</p>
        <h1>Everything in its place.</h1>
        <p className="hero-copy">Search, count, and label your medical stock with clarity.</p>

        <div className="search-panel">
          <div className="search-box">
            <IconSearch size={22} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by product, SKU, or category…" autoFocus />
            {search && <button onClick={() => setSearch("")} aria-label="Clear search"><IconX size={18} /></button>}
            <span className="shortcut">⌘ K</span>
          </div>
          <button className={`date-control ${date ? "active" : ""}`} onClick={() => dateInput.current?.showPicker()}>
            <IconCalendar size={18} />
            <span>{date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "All stock dates"}</span>
            <IconChevronDown size={17} />
            <input ref={dateInput} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </button>
        </div>
      </section>

      <section className="inventory">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Current inventory</p>
            <h2>{filtered.length} {filtered.length === 1 ? "item" : "items"}</h2>
          </div>
          <p>Updated just now</p>
        </div>

        {filtered.length > 0 ? (
          <div className="product-grid">
            {filtered.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="image-wrap">
                  <ProductArtwork product={product} />
                  <label className="edit-image" title="Change cover image">
                    <IconPhotoEdit size={17} />
                    <input type="file" accept="image/*" onChange={(event) => changeImage(product.id, event)} />
                  </label>
                  <span className="category-pill">{product.category}</span>
                </div>
                <div className="card-body">
                  <h3>{product.name}</h3>
                  <div className="metadata">
                    <span><small>SKU</small>{product.sku}</span>
                    <span><small>STOCK DATE</small>{new Date(`${product.date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  </div>
                  <div className="quantity-row">
                    <div><small>QUANTITY</small><strong>{product.quantity}</strong><span> units</span></div>
                    <div className="stepper">
                      <button onClick={() => adjustQuantity(product.id, -1)} aria-label={`Decrease ${product.name}`}>−</button>
                      <button onClick={() => adjustQuantity(product.id, 1)} aria-label={`Increase ${product.name}`}>+</button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <IconPackage size={40} stroke={1.3} />
            <h3>No stock items found</h3>
            <p>Try another search term or stock date.</p>
            <button onClick={() => { setSearch(""); setDate(""); }}>Reset filters</button>
          </div>
        )}
      </section>

      <div className="action-dock">
        <button className="generate-button" onClick={() => { setIsBarcodeModalOpen(true); setPrintStatus("idle"); setPrintMessage(""); }} disabled={!barcodeProducts.length}>
          <IconBarcode size={21} /> Generate {barcodeProducts.length === 1 ? "barcode" : "barcodes"}
          {barcodeProducts.length > 0 && <span className="selection-count">{barcodeProducts.length}</span>}
        </button>
        <button className="clear-button" onClick={clearAll}>Clear</button>
      </div>

      {isBarcodeModalOpen && barcodeProducts.length > 0 && (
        <div className="modal-backdrop" onMouseDown={closeBarcodeModal}>
          <div className="barcode-modal multi-barcode-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="barcode-modal-title">
            <button className="modal-close" onClick={closeBarcodeModal} aria-label="Close generated barcodes" disabled={printStatus === "printing"}><IconX size={20} /></button>
            <div className="success-icon"><IconCheck size={22} /></div>
            <p className="section-kicker">Barcodes ready</p>
            <h2 id="barcode-modal-title">{barcodeProducts.length} {barcodeProducts.length === 1 ? "product" : "products"} with stock</h2>
            <p className="barcode-help">Products with a quantity above zero are included automatically.</p>
            <div className="printer-chip">
              <span className="printer-dot" />
              <div><strong>{brotherPrinterConfig.model}</strong><small>{brotherPrinterConfig.connection} direct print</small></div>
            </div>
            <div className="barcode-labels">
              {barcodeProducts.map((product) => (
                <article className="barcode-label" key={product.id}>
                  <div className="barcode-label-heading">
                    <div>
                      <h3>{product.name}</h3>
                      <p>{product.quantity} {product.quantity === 1 ? "unit" : "units"} in stock</p>
                    </div>
                    <span>{product.category}</span>
                  </div>
                  <div className="barcode-paper">
                    <Barcode value={product.sku} format="CODE128" height={58} width={1.35} fontSize={13} background="transparent" />
                  </div>
                </article>
              ))}
            </div>
            {printMessage && <div className={`print-message ${printStatus}`} role="status">{printMessage}</div>}
            <div className="barcode-actions">
              <button className="print-button" onClick={printWithBrother} disabled={printStatus === "printing"}>
                {printStatus === "printing" ? "Sending to printer…" : "Print to Brother QL-820NWB"}
              </button>
              <button className="cancel-button" onClick={closeBarcodeModal} disabled={printStatus === "printing"}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}><IconCheck size={17} /> Search and quantities cleared</div>
    </main>
  );
}
