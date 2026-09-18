# MedStock Overview

## Tech stack

- Next.js 16.3.5 สำหรับหน้าเว็บและการจัดการ UI
- React สำหรับ state และ interaction ของ inventory
- `react-barcode` สำหรับแสดงตัวอย่าง Barcode ในหน้าเว็บ
- Brother b-PAC SDK และ Brother b-PAC Browser Extension สำหรับสั่งพิมพ์โดยตรง
- เครื่องพิมพ์ Brother QL-820NWB เชื่อมต่อผ่าน USB
- P-touch Editor สำหรับสร้างแม่แบบฉลาก `.lbx`

## Inventory UI

- มี Search bar สำหรับค้นหาจากชื่อสินค้า, SKU หรือ Category
- มีตัวกรองตาม Stock date
- แสดงสินค้าแบบ Card พร้อม Category, Product name, SKU, Stock date และ Quantity
- ผู้ใช้เพิ่มหรือลด Quantity ได้จากปุ่ม `+` และ `-` บน Card
- ข้อมูลสินค้าที่ใช้อยู่ในขณะนี้เป็น Mock data
- ปุ่ม `Generate barcode(s)` จะพร้อมใช้งานเมื่อมีสินค้าอย่างน้อยหนึ่งรายการที่ Quantity มากกว่า 0
- ไม่ต้องติ๊กเลือกสินค้า ระบบจะเลือกสินค้าทุกรายการที่ Quantity มากกว่า 0 ให้อัตโนมัติ
- ปุ่ม `Clear` ใช้ล้างข้อความค้นหา, ตัวกรองวันที่ และ Quantity ของสินค้าทั้งหมด

## Barcode modal

- เมื่อกด `Generate barcode(s)` ระบบเปิด Modal และแสดงเฉพาะสินค้าที่ Quantity มากกว่า 0
- Modal แสดงชื่อสินค้า, จำนวน, Category และตัวอย่าง Barcode
- จำนวนฉลากที่ต้องพิมพ์อ้างอิงจาก Quantity ของสินค้า
- การกดปิด Modal หรือกด Close จะไม่ล้าง Search bar และ Quantity
- มีปุ่ม `Print to Brother QL-820NWB` สำหรับสั่งพิมพ์ผ่าน USB โดยตรง

## Brother QL-820NWB integration

- ติดตั้ง Brother b-PAC SDK และ Brother b-PAC Browser Extension แล้ว
- นำไฟล์ `bpac.js` มาไว้ที่ `public/brother/bpac.js` แล้ว
- ต้นฉบับของไฟล์ที่ติดตั้งมากับ SDK อยู่ที่:
  - `C:\Program Files\Brother bPAC3 SDK\Redist\Extensions\bpac.js`
  - `C:\Program Files\Brother bPAC3 SDK\Samples\JavaScript\bpac.js`
- โค้ดเชื่อมต่อเครื่องพิมพ์อยู่ที่ `lib/brother-print.ts`
- ค่าเริ่มต้นของไฟล์แม่แบบคือ `C:\MedStock\labels\medstock.lbx`
- เพิ่ม `suppressHydrationWarning` ใน Root layout เพื่อรองรับ class ที่ b-PAC Extension เพิ่มลงใน `<body>` ก่อน React hydrate
- Production build ผ่านหลังแก้ Hydration warning แล้ว

## Current printing status

- เว็บโหลด `bpac.js` และเรียก Brother b-PAC ได้แล้ว
- สร้างไฟล์ `C:\MedStock\labels\medstock.lbx` ด้วย P-touch Editor แล้ว
- แม่แบบต้องตั้ง `Object Name` ให้ตรงกับ `product_name`, `barcode` และ `uuid`
- ต้องปิด P-touch Editor ก่อนสั่งพิมพ์ เพื่อไม่ให้ไฟล์ `.lbx` ถูกล็อก
- ควรเปิดเว็บผ่าน Chrome หรือ Edge ที่ติดตั้ง Brother b-PAC Extension ไม่ใช่ Codex in-app browser

## Agreed label format

ฉลากที่ต้องการประกอบด้วย:

1. `product_name` — ชื่อสินค้า
2. `barcode` — Barcode แบบ Code 128 ซึ่งควรเข้ารหัส UUID ของสินค้าแต่ละชิ้น
3. `uuid` — ข้อความ UUID ที่อ่านได้ด้วยตา

รูปแบบ UUID ที่ตกลงไว้:

```text
{SKU}-{StockDate:DDMMYY}-{RunningNumber}
```

ตัวอย่าง:

```text
MED-PCM-500-160926-A0001
MED-PCM-500-160926-A0002
```

ใน P-touch Editor ให้สร้างวัตถุและตั้ง `Object Name` เป็น `product_name`, `barcode` และ `uuid` ตามลำดับ ข้อมูลตัวอย่างที่ใส่ตอนออกแบบไม่มีผล เพราะ MedStock จะเขียนค่าจริงทับก่อนพิมพ์

## Pending work

- ตรวจสอบ Object Name ใน `medstock.lbx` ให้ครบ `product_name`, `barcode` และ `uuid`
- ย้าย Running number จาก browser local storage ไปเก็บในฐานข้อมูล ก่อนใช้งานพร้อมกันหลายเครื่อง
- ทดสอบพิมพ์จริงกับ Brother QL-820NWB และม้วน DK ที่ใช้งาน

## Related files

- `app/page.tsx` — Inventory UI, Quantity และ Barcode modal
- `app/globals.css` — รูปแบบหน้าเว็บและ Modal
- `app/layout.tsx` — Root layout และ Hydration handling
- `lib/brother-print.ts` — Brother b-PAC printing integration
- `public/brother/bpac.js` — Browser module ของ Brother b-PAC
- `docs/BROTHER_QL820NWB_SETUP.md` — ขั้นตอนตั้งค่าเครื่องพิมพ์
- `.env.example` — ตัวแปรสำหรับตำแหน่ง `bpac.js` และไฟล์ `.lbx`

## Update log — 16 September 2026

- เปลี่ยนขั้นตอนเลือกสินค้าเป็นเลือกอัตโนมัติจาก Quantity ที่มากกว่า 0
- เพิ่ม Modal แสดงรายการ Barcode ที่กำลังจะพิมพ์
- รักษาค่า Search และ Quantity ไว้เมื่อปิด Modal
- เพิ่มการเชื่อมต่อ Brother QL-820NWB ผ่าน USB และ b-PAC
- แก้ Hydration error ที่เกิดหลังติดตั้ง b-PAC Extension
- พบและติดตั้ง `bpac.js` ลงในโปรเจกต์สำเร็จ
- ตรวจพบว่าไฟล์แม่แบบ `medstock.lbx` ยังไม่มี และสร้างโฟลเดอร์ `labels` เตรียมไว้แล้ว
- สร้างไฟล์แม่แบบ `medstock.lbx` สำหรับฉลากขนาด 62 × 40 มม.
- เปลี่ยนรูปแบบ UUID รายชิ้นเป็น `{SKU}-{StockDate:DDMMYY}-{RunningNumber}`
- ตัดวัตถุ `sku` และ `category` ออกจากแม่แบบที่โค้ดต้องใช้
- เพิ่มการพิมพ์ทีละหนึ่งฉลาก พร้อม UUID ลำดับถัดไปต่อ SKU และวันที่
- เก็บ Running number ชั่วคราวใน browser local storage
- เพิ่ม Brother print log ใน Modal สำหรับดูสถานะ template, printer, USB port, media, UUID, ผลลัพธ์ `StartPrint`, `PrintOut`, `EndPrint` และ error code
- เปลี่ยนเงื่อนไขสำเร็จให้ยอมรับเฉพาะเมื่อ b-PAC คืนค่า `true` ในทุกขั้นตอนการพิมพ์
