# MedStock Barcode Web API extension

`BarcodeApi.gs` is added to the bound Apps Script project without replacing `Code.gs` or `WebApi.gs`.

Add this dispatcher immediately before the existing `Unsupported action` return in `doPost`:

```js
const barcodeResponse = medStockBarcodeDispatch_(body, ss);
if (barcodeResponse) return medStockWebApiJson_(barcodeResponse);

const stockResponse = medStockStockOperationDispatch_(body, ss);
if (stockResponse) return medStockWebApiJson_(stockResponse);
```

Run `setupMedStockBarcodeApi` once, verify `BC_Registry!M1:N1` and `BC_Print_Log!A1:I1`, then deploy a new version on the existing Web App deployment.
