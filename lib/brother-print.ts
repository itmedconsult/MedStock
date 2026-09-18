export type BrotherPrintProduct = {
  name: string;
  sku: string;
  date: string;
  quantity: number;
};

export type BrotherPrintLabel = Omit<BrotherPrintProduct, "quantity"> & {
  uuid: string;
};

export type BrotherLabelStatus = "queued" | "printing" | "sent" | "failed";

export type BrotherLabelUpdate = {
  uuid: string;
  status: BrotherLabelStatus;
  error?: string;
};

export type BrotherPrintBatchResult = {
  sent: number;
  failed: number;
  pending: number;
  error?: string;
};

export type BrotherPrintLog = {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  step: string;
  message: string;
};

type BpacLabelObject = {
  Text: string;
};

type BpacPrinter = {
  GetMediaName: () => Promise<string>;
  IsPrinterOnline: (printerName: string) => Promise<boolean>;
  readonly ErrorCode: Promise<number>;
  readonly ErrorString: Promise<string>;
  readonly Name: Promise<string>;
  readonly PortName: Promise<string>;
};

type BpacDocument = {
  Open: (templatePath: string) => Promise<boolean>;
  GetObject: (name: string) => Promise<BpacLabelObject | null>;
  GetMediaName: () => Promise<string>;
  GetPrinter: () => Promise<BpacPrinter>;
  GetPrinterName: () => Promise<string>;
  StartPrint: (jobName: string, options: number) => Promise<boolean>;
  PrintOut: (copies: number, options: number) => Promise<boolean>;
  EndPrint: () => Promise<boolean>;
  Close: () => Promise<boolean>;
  readonly ErrorCode: Promise<number>;
};

type BpacModule = {
  IDocument: BpacDocument;
};

const BPAC_MODULE_URL = process.env.NEXT_PUBLIC_BPAC_MODULE_URL ?? "/brother/bpac.js";
const TEMPLATE_PATH = process.env.NEXT_PUBLIC_BROTHER_TEMPLATE_PATH ?? "C:\\MedStock\\labels\\medstock.lbx";
const SEQUENCE_STORAGE_KEY = "medstock:barcode-sequences:v1";

type BarcodeSequences = Record<string, number>;
type LogHandler = (entry: BrotherPrintLog) => void;
type LabelStatusHandler = (update: BrotherLabelUpdate) => void;

function createLogger(onLog?: LogHandler) {
  return (level: BrotherPrintLog["level"], step: string, message: string) => {
    const entry: BrotherPrintLog = {
      timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      level,
      step,
      message,
    };

    const consoleMethod = level === "error" ? console.error : level === "warning" ? console.warn : console.info;
    consoleMethod("[MedStock Brother Print]", entry);
    onLog?.(entry);
  };
}

function formatStockDate(stockDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stockDate);
  if (!match) throw new Error(`Invalid stock date '${stockDate}'. Expected YYYY-MM-DD.`);
  const [, year, month, day] = match;
  return `${day}${month}${year.slice(-2)}`;
}

export function formatBarcodeUuid(sku: string, stockDate: string, sequence: number) {
  return `${sku}-${formatStockDate(stockDate)}-A${String(sequence).padStart(4, "0")}`;
}

function sequenceKey(product: BrotherPrintProduct) {
  return `${product.sku}:${product.date}`;
}

function readSequences(): BarcodeSequences {
  try {
    const saved = window.localStorage.getItem(SEQUENCE_STORAGE_KEY);
    return saved ? JSON.parse(saved) as BarcodeSequences : {};
  } catch {
    throw new Error("Unable to read the barcode running number from browser storage.");
  }
}

function saveSequences(sequences: BarcodeSequences) {
  try {
    window.localStorage.setItem(SEQUENCE_STORAGE_KEY, JSON.stringify(sequences));
  } catch {
    throw new Error("Unable to save the barcode running number to browser storage.");
  }
}

async function loadBpac(): Promise<BpacModule> {
  try {
    const moduleUrl = BPAC_MODULE_URL;
    return await import(/* webpackIgnore: true */ moduleUrl) as BpacModule;
  } catch {
    throw new Error("Brother b-PAC is not available. Install b-PAC and its browser extension, then copy bpac.js to public/brother/bpac.js.");
  }
}

async function setLabelText(document: BpacDocument, objectName: string, value: string) {
  const object = await document.GetObject(objectName);
  if (!object) throw new Error(`The label template is missing the '${objectName}' object.`);
  object.Text = value;
}

async function getPrinterError(printer: BpacPrinter) {
  try {
    const [code, message] = await Promise.all([printer.ErrorCode, printer.ErrorString]);
    return `Brother error ${code}: ${message || "No error description returned"}`;
  } catch {
    return "Brother did not return an error code.";
  }
}

export function prepareBrotherPrintLabels(products: BrotherPrintProduct[]) {
  if (!products.length) throw new Error("There are no products with a quantity above zero.");

  const sequences = readSequences();
  const labels: BrotherPrintLabel[] = [];

  for (const product of products) {
    const key = sequenceKey(product);
    let currentSequence = sequences[key] ?? 0;

    for (let unit = 0; unit < product.quantity; unit += 1) {
      currentSequence += 1;
      labels.push({
        name: product.name,
        sku: product.sku,
        date: product.date,
        uuid: formatBarcodeUuid(product.sku, product.date, currentSequence),
      });
    }

    sequences[key] = currentSequence;
  }

  // Reserve every UUID before printing so retries can reuse the exact same label
  // without another batch accidentally receiving the same running number.
  saveSequences(sequences);
  return labels;
}

async function checkPrinterAfterLabel(printer: BpacPrinter, printerName: string) {
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  const [isOnline, errorCode, errorString] = await Promise.all([
    printer.IsPrinterOnline(printerName),
    printer.ErrorCode,
    printer.ErrorString,
  ]);

  if (!isOnline || errorCode !== 0) {
    throw new Error(
      `${printerName} reported a hardware problem after printing. Brother error ${errorCode}: ${errorString || "No error description returned"}`,
    );
  }
}

export async function printLabelsToBrother(
  labels: BrotherPrintLabel[],
  onLog?: LogHandler,
  onLabelStatus?: LabelStatusHandler,
): Promise<BrotherPrintBatchResult> {
  if (!labels.length) throw new Error("There are no labels to print.");

  const log = createLogger(onLog);
  log("info", "INIT", `Loading b-PAC module from ${BPAC_MODULE_URL}`);

  let bpac: BpacModule;
  try {
    bpac = await loadBpac();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brother b-PAC failed to load.";
    labels.forEach((label) => onLabelStatus?.({ uuid: label.uuid, status: "failed", error: message }));
    log("error", "FAILED", message);
    return { sent: 0, failed: labels.length, pending: 0, error: message };
  }

  const document = bpac.IDocument;
  let sent = 0;
  let failed = 0;

  log("success", "INIT", `b-PAC loaded. Preparing ${labels.length} individual label(s).`);

  for (const [index, label] of labels.entries()) {
    let isOpen = false;
    let isStarted = false;
    let printer: BpacPrinter | null = null;
    onLabelStatus?.({ uuid: label.uuid, status: "printing" });

    try {
      log("info", "TEMPLATE", `Opening ${TEMPLATE_PATH}`);
      isOpen = await document.Open(TEMPLATE_PATH);
      if (!isOpen) throw new Error(`Unable to open the Brother label template at ${TEMPLATE_PATH}.`);
      log("success", "TEMPLATE", "Label template opened successfully.");

      const [templatePrinterName, templateMediaName] = await Promise.all([
        document.GetPrinterName(),
        document.GetMediaName(),
      ]);
      printer = await document.GetPrinter();
      const [printerName, portName, printerMediaName] = await Promise.all([
        printer.Name,
        printer.PortName,
        printer.GetMediaName(),
      ]);
      const isOnline = await printer.IsPrinterOnline(printerName);

      log(
        isOnline ? "success" : "error",
        "PRINTER",
        `${printerName} on ${portName || "unknown port"}; online=${isOnline}; template printer=${templatePrinterName}; template media=${templateMediaName}; loaded media=${printerMediaName}`,
      );

      if (!isOnline) throw new Error(`${printerName} is offline. ${await getPrinterError(printer)}`);

      await setLabelText(document, "product_name", label.name);
      await setLabelText(document, "barcode", label.uuid);
      await setLabelText(document, "uuid", label.uuid);
      log("success", "LABEL", `Prepared ${label.uuid} (${index + 1}/${labels.length}).`);

      const jobName = `MedStock - ${label.uuid}`;
      const startResult = await document.StartPrint(jobName, 0);
      log(startResult ? "success" : "error", "START", `StartPrint('${jobName}') returned ${startResult}.`);
      if (!startResult) throw new Error(`Brother rejected StartPrint. ${await getPrinterError(printer)}`);
      isStarted = true;

      const printResult = await document.PrintOut(1, 0);
      log(printResult ? "success" : "error", "PRINT", `PrintOut('${label.uuid}') returned ${printResult}.`);
      if (!printResult) throw new Error(`Brother rejected label ${label.uuid}. ${await getPrinterError(printer)}`);

      const endResult = await document.EndPrint();
      isStarted = false;
      log(endResult ? "success" : "error", "END", `EndPrint() returned ${endResult}.`);
      if (!endResult) throw new Error(`Brother could not finish the print job. ${await getPrinterError(printer)}`);

      await checkPrinterAfterLabel(printer, printerName);
      sent += 1;
      onLabelStatus?.({ uuid: label.uuid, status: "sent" });
      log("success", "LABEL_OK", `${label.uuid} was accepted with no Brother hardware error reported.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brother QL-820NWB printing failed.";
      let diagnostic = "";

      if (printer) diagnostic = ` ${await getPrinterError(printer)}`;

      log("error", "FAILED", `${message}${diagnostic}`.trim());
      failed += 1;
      onLabelStatus?.({ uuid: label.uuid, status: "failed", error: message });

      if (isStarted) {
        try {
          const endResult = await document.EndPrint();
          log(endResult ? "warning" : "error", "RECOVER", `EndPrint() after failure returned ${endResult}.`);
        } catch {
          log("warning", "RECOVER", "Brother did not accept EndPrint() during recovery.");
        }
      }
    } finally {
      if (isOpen) {
        try {
          const closeResult = await document.Close();
          log(closeResult ? "info" : "warning", "CLOSE", `Close() returned ${closeResult}.`);
        } catch {
          log("warning", "CLOSE", "Close() failed after the print attempt.");
        }
      }
    }

    // Stop the batch at the first error. Remaining labels stay queued so the
    // operator can clear the jam and retry only failed/unprinted labels.
    if (failed > 0) break;
  }

  const pending = labels.length - sent - failed;
  const error = failed > 0 ? "Printing stopped after a label error. Clear the printer problem, then retry failed/unprinted labels." : undefined;
  log(failed > 0 ? "warning" : "success", "COMPLETE", `${sent} sent, ${failed} failed, ${pending} pending.`);
  return { sent, failed, pending, error };
}

export const brotherPrinterConfig = {
  model: "Brother QL-820NWB",
  connection: "USB",
  templatePath: TEMPLATE_PATH,
};
