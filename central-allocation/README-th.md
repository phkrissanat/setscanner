# SET scanner — ตัวกรองอุตสาหกรรมส่วนกลาง

สถานะ: โค้ดพร้อมทดสอบเชื่อมระบบ ยังไม่ได้ deploy และยังไม่มีแหล่งข้อมูลจริงที่เชื่อมแล้ว

## สิ่งที่ทำแล้ว
- Cloudflare Worker มี scheduled handler: จันทร์–ศุกร์ 18:30 และ 20:30 เวลาไทย (11:30/13:30 UTC)
- คำนวณ EMA12 > EMA26 ของดัชนีกลุ่ม จากแท่งรายวันที่ปิดแล้วอย่างน้อย 60 แท่ง สูตรเริ่มต้น ไม่ใช่ผล backtest หรือการรับประกันกลยุทธ์
- เก็บผลกลางใน Cloudflare KV; endpoint GET /allocation สำหรับ PWA และ /health สำหรับตรวจสถานะ
- PWA กรองทั้งก่อนสแกนและก่อนแสดง watch list/available โดยไม่มีเมนูให้เลือก
- หุ้นใน portfolio ยังสแกนเสมอ ไม่มีการเขียนข้อมูลส่วนบุคคลไปที่ Worker
- ข้อมูลหาย/เก่า/ผิด schema/โหลดไม่ได้: งดสัญญาณใหม่ ไม่เปลี่ยนเป็นผ่านโดยอัตโนมัติ
- ไม่เปลี่ยน Firebase config และไม่แตะ proxy เดิม

## ข้อจำกัดที่ต้องทราบก่อนเปิดใช้
ชุดนี้ยังไม่ใช่ระบบพร้อมใช้งานจริง: INDUSTRY_FEED_URL, KV namespace, PWA_ORIGIN และ URL endpoint ใน PWA ยังไม่ได้กำหนด
ตัวรับข้อมูลรองรับ JSON contract ด้านล่าง แต่ยังต้องสร้าง adapter ให้แหล่งข้อมูลตลาดจริง หรือเลือกบริการที่ส่ง contract นี้ได้ ไม่ได้ใช้ URL ที่เดาจาก SET/TradingView/Yahoo
ยังไม่ได้เชื่อมบัญชี Cloudflare หรือ GitHub และไม่ได้เปิด Cron จริง
งานที่รันแม้ปิด PWA คือการประเมินอุตสาหกรรมเท่านั้น การสแกนสัญญาณรายหุ้นเดิมยังทำเมื่อเปิด PWA ไม่ได้เพิ่มการแจ้งเตือน push
ยังไม่รวม section ราคาพอร์ต/น้ำหนักพอร์ตหรือ ranking ที่เคยคุยไว้

## ข้อมูลที่ต้องได้ก่อน deploy
1. URL repo และ URL GitHub Pages จริง
2. ช่องทางเข้าบัญชี Cloudflare ที่ได้รับสิทธิ์ และโค้ด Worker เดิมหากต้องการใช้ร่วมกัน
3. แหล่งข้อมูลดัชนีกลุ่มที่เข้าถึงได้ พร้อมตารางสมาชิกหุ้น–กลุ่มจากแหล่งเดียวกัน/วันที่ตรวจสอบแล้ว
ไม่ต้องส่ง token หรือรหัสผ่านในแชต เก็บ FEED_TOKEN เป็น secret ผ่าน Cloudflare หากผู้ให้บริการต้องใช้

## Contract ของ industry feed
HTTPS endpoint ที่ server เรียกได้ ส่ง JSON:
- schemaVersion: 1
- generatedAt: ISO timestamp ของเวลาจัดทำข้อมูล (ไม่เกิน 30 ชั่วโมงและไม่เกินอนาคต 5 นาที)
- groups: array ของกลุ่ม
  - id: รหัสกลุ่ม A-Z, 0-9, underscore หรือ hyphen
  - name: ชื่อกลุ่ม
  - symbols: รายชื่อหุ้นในกลุ่ม ใช้สัญลักษณ์เดียวกับ PWA ไม่ต่อ .BK; ห้ามซ้ำข้ามกลุ่ม
  - bars: 60–1000 แท่ง เรียงวันเก่าไปใหม่ ไม่ซ้ำ
    - date: YYYY-MM-DD วันที่ตลาดตามเวลาไทย
    - close: ตัวเลขบวกจำกัดค่า
    - closed: true สำหรับแท่งปิดแล้วเท่านั้น
ดัชนีกลุ่มต้องเป็นชุดข้อมูลที่สอดคล้องกัน ไม่ผสมราคาหุ้นตัวแทนกับดัชนีกลุ่มโดยไม่ระบุ
ใช้ข้อมูลล่าสุดไม่เกิน 96 ชั่วโมงนับจาก 17:00 ไทยของวันแท่งล่าสุด; วันหยุดยาวอาจหยุดรับสัญญาณใหม่โดยตั้งใจ ยังไม่มีปฏิทินวันหยุดตลาด
ผลคำนวณหมดอายุหลัง 30 ชั่วโมง; Cron วันศุกร์จึงอาจหมดอายุช่วงสุดสัปดาห์ และกลับมาหลังรันสำเร็จครั้งถัดไป
KV เป็น eventually consistent จึงอาจเห็นผลรอบก่อนชั่วครู่ แต่ตรวจวันหมดอายุทั้ง server/client

## ขั้นตอนนำขึ้นระบบ (หลังยืนยันข้อมูลครบ)
1. ใช้ Wrangler CLI ในสภาพแวดล้อมที่ติดตั้งและล็อกอินแล้ว สร้าง KV namespace สำหรับ ALLOCATION
2. ใส่ namespace ID, PWA_ORIGIN เช่น https://USER.github.io (ไม่มี path), และ INDUSTRY_FEED_URL จริงใน worker/wrangler.jsonc
3. ถ้าต้องใช้ secret ตั้ง FEED_TOKEN ด้วย Wrangler secret หรือ Cloudflare dashboard
4. deploy เป็น Worker ใหม่ชื่อ setscanner-allocation เพื่อไม่เขียนทับ proxy เดิม
5. ทดสอบ scheduled invocation และตรวจ /health กับ /allocation ให้ได้ ready จากข้อมูลจริงก่อน
6. ใส่ https://WORKER_HOST/allocation ใน meta allocation-endpoint ของ pwa/index.html
7. นำไฟล์ทั้งหมดใน pwa/ ขึ้นโฟลเดอร์เผยแพร่ GitHub Pages เดิม (รวม allocation.mjs)
8. ยืนยัน login, พอร์ต, ตัวกรอง, อัปเดต service worker และ Cron execution logs บนมือถือจริง
อย่าอัปโหลด pwa/ ชุดนี้ทับเว็บจริงก่อนตั้ง endpoint เพราะมันจะงดสัญญาณเข้าใหม่เมื่อยังไม่เชื่อมข้อมูลกลาง

## ทดสอบ
ใช้ Node.js 24: node --test tests/allocation.test.mjs จากโฟลเดอร์นี้
ผลในเครื่อง: ผ่าน 20 tests และ syntax ของ JavaScript ใน PWA/service worker
ทดสอบด้วยข้อมูลสังเคราะห์และ mock fetch/KV; ไม่ใช่การทดสอบราคาตลาดจริง Cloudflare จริง หรือ mobile browser

## อ้างอิง
https://developers.cloudflare.com/workers/configuration/cron-triggers/
https://developers.cloudflare.com/workers/wrangler/configuration/
https://www.set.or.th/en/market/index/set/industry-sector-profile

## สถานะบน GitHub
ชุดนี้อยู่ใต้ central-allocation/ ใน Draft PR; ไฟล์เว็บที่ root ไม่เปลี่ยน ต้องเชื่อม feed และ Cloudflare ก่อนนำ PWA ชุดทดลองมาแทน root

## ตรวจระบบจริง 28 ตุลาคม 2026
- เข้าบัญชี Cloudflare ได้ พบ Worker เดิม set-proxy (ไม่มี bindings) และไม่ได้แก้ไขโค้ดเดิม
- ตรวจ API ที่หน้า SET ใช้จริงจากสคริปต์ของ SET: /api/set/index/{index}/chart-quotation?period=1Y&lang=en และ /api/set/index/{index}/composition?lang=en
- ทดสอบ chart-quotation ของ AGRO: HTTP 403 ทั้งเรียกตรงและผ่าน proxy เดิม จึงยังไม่ได้ตรวจ schema ของ response ข้อมูลจริง และยังใช้เป็น feed ไม่ได้
- ไม่ใช้ข้อมูลสังเคราะห์แทนข้อมูลตลาดจริง และไม่มีการนำผลกรองเข้า production
- Cloudflare ขั้นสร้าง Worker เริ่มด้วย Hello World; การกด Deploy ถูกระบบอนุมัติอัตโนมัติปฏิเสธเพราะเป็นการสร้างทรัพยากรถาวรด้วย placeholder จึงยังไม่ได้สร้าง Worker, KV หรือเปิด Cron
- ขั้นถัดไป: ยืนยันการสร้าง Worker เพื่อใส่โค้ดที่เตรียมไว้และผูก KV; จัดหา feed ดัชนีกลุ่มที่เรียกจาก server ได้จริงก่อนเปิดใช้การกรอง
