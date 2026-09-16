export type BrotherPrintProduct = {
  name: string;
  sku: string;
  quantity: number;
  category: string;
};

type BpacLabelObject = {
  Text: string;
};

type BpacDocument = {
  Open: (templatePath: string) => Promise<boolean>;
  GetObject: (name: string) => Promise<BpacLabelObject | null>;
  StartPrint: (jobName: string, options: number) => Promise<void> | void;
  PrintOut: (copies: number, options: number) => Promise<void> | void;
  EndPrint: () => Promise<void> | void;
  Close: () => Promise<void> | void;
};

type BpacModule = {
  IDocument: BpacDocument;
};

const BPAC_MODULE_URL = process.env.NEXT_PUBLIC_BPAC_MODULE_URL ?? "/brother/bpac.js";
const TEMPLATE_PATH = process.env.NEXT_PUBLIC_BROTHER_TEMPLATE_PATH ?? "C:\\MedStock\\labels\\medstock.lbx";

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

export async function printProductsToBrother(products: BrotherPrintProduct[]) {
  if (!products.length) throw new Error("There are no products with a quantity above zero.");

  const bpac = await loadBpac();
  const document = bpac.IDocument;

  for (const product of products) {
    let isOpen = false;
    try {
      isOpen = await document.Open(TEMPLATE_PATH);
      if (!isOpen) throw new Error(`Unable to open the Brother label template at ${TEMPLATE_PATH}.`);

      await setLabelText(document, "product_name", product.name);
      await setLabelText(document, "sku", product.sku);
      await setLabelText(document, "barcode", product.sku);
      await setLabelText(document, "category", product.category);

      await document.StartPrint(`MedStock - ${product.sku}`, 0);
      await document.PrintOut(product.quantity, 0);
      await document.EndPrint();
    } catch (error) {
      throw error instanceof Error ? error : new Error("Brother QL-820NWB printing failed.");
    } finally {
      if (isOpen) await document.Close();
    }
  }
}

export const brotherPrinterConfig = {
  model: "Brother QL-820NWB",
  connection: "USB",
  templatePath: TEMPLATE_PATH,
};
