import { redirect } from "next/navigation";

export default function InventoryRedirectPage() {
  redirect("/create-barcode");
}
