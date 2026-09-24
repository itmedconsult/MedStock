export type Packaging = { packageUnit?: string; unitsPerPack?: number };

export function isPacked(product: Packaging) {
  return product.packageUnit === "Box" && Number.isInteger(product.unitsPerPack) && Number(product.unitsPerPack) > 0;
}

export function importQuantity(product: Packaging) {
  return isPacked(product) ? Number(product.unitsPerPack) : 1;
}

export function isDiscreteUnit(unit: string) {
  return ["bottle", "syringe"].includes(unit.toLowerCase());
}
