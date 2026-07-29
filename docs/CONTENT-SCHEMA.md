# TOEIC-750 Content Schema (v1)

ทุกไฟล์เนื้อหาเป็น JSON UTF-8 ไม่มี BOM. **ห้ามคัดลอกข้อสอบจริงของ ETS** — ต้องเขียนขึ้นใหม่ทั้งหมด
เลียนแบบเฉพาะ *รูปแบบ* และ *ระดับความยาก*

## กฎกลาง (บังคับทุกไฟล์)

1. `answer` เป็น index แบบ 0-based
2. คำอธิบายทั้งหมด (`th`, `explain`) เป็น **ภาษาไทย** เขียนแบบคนไม่มีพื้นฐานอังกฤษเลยก็อ่านรู้เรื่อง
   - ห้ามใช้ศัพท์เทคนิคภาษาอังกฤษลอยๆ ต้องมีคำไทยกำกับเสมอ เช่น "gerund (คำกริยาเติม -ing ที่ทำหน้าที่เป็นคำนาม)"
3. `explain.wrong` เป็น **object** key = index ของตัวเลือกที่ผิด (string) → เหตุผลภาษาไทย
   ต้องมีครบทุกตัวเลือกที่ไม่ใช่คำตอบ
4. `tier`: `"easy"` | `"medium"` | `"real"`
   - `easy` — ประโยคสั้น ≤ 12 คำ ศัพท์อยู่ในระดับ 1,000 คำแรก ตัวลวงต่างกันชัดเจน
   - `medium` — ประโยค 12–20 คำ ศัพท์ธุรกิจพื้นฐาน ตัวลวงใกล้เคียงขึ้น
   - `real` — ความยาวและความยากเท่าข้อสอบจริง ตัวลวงหลอกได้จริง
5. `id` ต้องไม่ซ้ำทั้งโปรเจกต์ รูปแบบ `<prefix>-<batch>-<running>` เช่น `p5e-01-007`
6. ห้ามใส่ HTML ใน field ข้อความ ยกเว้น field `svg`
7. บริบทต้องเป็น **โลกธุรกิจ/ที่ทำงาน** แบบ TOEIC: ออฟฟิศ, การเดินทาง, ประชุม, สั่งซื้อ, บริการลูกค้า,
   บุคลากร, การเงิน, โรงงาน, ร้านอาหาร, โรงแรม, สุขภาพในที่ทำงาน
   **ห้าม**: การเมือง, ศาสนา, ความรุนแรง, การแพทย์เชิงลึก, เรื่องส่วนตัวอ่อนไหว
8. `accent` เลือกจาก `"US"` | `"UK"` | `"CA"` | `"AU"` — กระจายให้ใกล้เคียงกันทั้งไฟล์

## โครงไฟล์

```jsonc
{
  "meta": { "batch": "p5e-01", "part": 5, "tier": "easy", "count": 50 },
  "items": [ /* Item หรือ Group */ ]
}
```

---

## Part 5 — Incomplete Sentences (Item เดี่ยว, 4 ตัวเลือก)

```jsonc
{
  "id": "p5e-01-001",
  "part": 5,
  "tier": "easy",
  "topic": "tense-past-simple",          // slug ภาษาอังกฤษ ใช้จัดกลุ่มดริล
  "topicTh": "อดีตกาลธรรมดา",
  "stem": "The manager _____ the report last Friday.",   // ใช้ _____ (5 ขีด) เป็นช่องว่าง
  "choices": ["review", "reviews", "reviewed", "reviewing"],
  "answer": 2,
  "th": {
    "stem": "ผู้จัดการ_____รายงานเมื่อวันศุกร์ที่แล้ว",
    "choices": ["ตรวจ (รูปพื้นฐาน)", "ตรวจ (ปัจจุบัน เอกพจน์)", "ตรวจ (อดีต)", "กำลังตรวจ"]
  },
  "explain": {
    "why": "ประโยคมี last Friday = เมื่อวันศุกร์ที่แล้ว ซึ่งเป็นอดีต จึงต้องใช้กริยาช่อง 2 คือ reviewed",
    "wrong": {
      "0": "review เป็นรูปพื้นฐาน ใช้กับปัจจุบันและประธานพหูพจน์ ไม่เข้ากับ last Friday",
      "1": "reviews เป็นปัจจุบันกาล ใช้กับเหตุการณ์ที่ทำเป็นประจำ ขัดกับคำว่า last Friday",
      "3": "reviewing เป็นรูป -ing ใช้ตามลำพังไม่ได้ ต้องมี is/was/are นำหน้า"
    },
    "point": "เห็นคำบอกเวลาอดีต (last …, yesterday, ago, in 2020) → ใช้กริยาช่อง 2 ทันที",
    "trick": "อ่านหาคำบอกเวลาในประโยคก่อนดูตัวเลือก จะตัดได้ 3 ตัวใน 5 วินาที"
  },
  "vocab": [
    { "w": "quarterly", "ipa": "/ˈkwɔːrtərli/", "th": "ควอ-เทอร์-ลี",
      "mean": "รายไตรมาส (ทุก 3 เดือน)", "pos": "adj." }
  ]
}
```

`topic` ที่ใช้ได้ (Part 5/6): `tense-*`, `subject-verb-agreement`, `word-form`, `pronoun`,
`preposition-time`, `preposition-place`, `article`, `conjunction`, `relative-clause`, `passive`,
`modal`, `gerund-infinitive`, `comparison`, `conditional`, `participle`, `quantifier`,
`vocab-choice`, `phrasal-verb`, `collocation`, `transition-word`

---

## Part 1 — Photographs (Item เดี่ยว, 4 ตัวเลือก, ทุกตัวเลือกเป็นเสียงล้วน)

```jsonc
{
  "id": "p1e-01-001",
  "part": 1,
  "tier": "easy",
  "svg": "<svg viewBox=\"0 0 400 300\" xmlns=\"http://www.w3.org/2000/svg\">…</svg>",
  "sceneTh": "ภาพ: ผู้ชายนั่งอยู่ที่โต๊ะทำงาน มีคอมพิวเตอร์เปิดอยู่ตรงหน้า มือวางบนคีย์บอร์ด",
  "sceneEn": "A man is sitting at a desk typing on a computer.",   // ใช้ตรวจสอบภายใน
  "accent": "US",
  "choices": [
    "The man is typing on a keyboard.",
    "The man is opening a window.",
    "The men are shaking hands.",
    "The desk is being moved."
  ],
  "answer": 0,
  "th": { "choices": ["ผู้ชายกำลังพิมพ์บนคีย์บอร์ด", "…", "…", "…"] },
  "explain": {
    "why": "…",
    "wrong": { "1": "…", "2": "…", "3": "…" },
    "point": "…",
    "trick": "…"
  },
  "vocab": [ … ]
}
```

**กติกา SVG**: `viewBox="0 0 400 300"`, ใช้เฉพาะ `rect circle ellipse line polyline polygon path g text`,
ใส่สีด้วย `fill`/`stroke` แบบ hex, **ห้าม** `<image>`, `<script>`, external ref, `style` แท็ก,
ห้ามใส่ข้อความภาษาอังกฤษที่เฉลยคำตอบลงในภาพ
ตัวลวงของ Part 1 ต้องเป็นแบบที่ข้อสอบจริงใช้: คำพ้องเสียง, กริยาผิด, จำนวนคนผิด, passive ที่ไม่เกิดขึ้น

---

## Part 2 — Question-Response (Item เดี่ยว, **3 ตัวเลือก**, เสียงล้วนทั้งหมด)

```jsonc
{
  "id": "p2e-01-001",
  "part": 2,
  "tier": "easy",
  "topic": "wh-where",
  "prompt": "Where did you put the sales report?",
  "promptAccent": "US",
  "choicesAccent": "AU",
  "choices": ["On your desk.", "Yes, I did.", "It was very informative."],
  "answer": 0,
  "th": { "prompt": "คุณเอารายงานยอดขายไปวางไว้ที่ไหน", "choices": ["บนโต๊ะคุณ", "ใช่ ฉันทำ", "มันมีประโยชน์มาก"] },
  "explain": {
    "why": "…",
    "wrong": { "1": "คำถามขึ้นต้นด้วย Where ตอบ Yes/No ไม่ได้ …", "2": "…" },
    "point": "…",
    "trick": "ฟังคำแรกให้ได้ว่าเป็น Where/When/Who/Why/How แล้วตัดตัวเลือกที่ตอบ Yes/No ทิ้งทันที"
  }
}
```

---

## Part 3 / Part 4 — Group (บทสนทนา/บทพูด + 3 คำถาม)

```jsonc
{
  "id": "p3m-01-001",
  "part": 3,                       // 4 สำหรับ talk
  "tier": "medium",
  "topic": "scheduling",
  "setting": "สำนักงาน — พูดคุยเรื่องเลื่อนประชุม",
  "audio": {
    "lines": [
      { "sp": "M", "accent": "US", "text": "Hi Karen, do you have a minute?" },
      { "sp": "W", "accent": "UK", "text": "Sure, what's up?" }
    ]
  },
  "th": { "lines": ["สวัสดีคาเรน ว่างสักครู่ไหม", "ได้สิ มีอะไรเหรอ"] },
  "questions": [
    {
      "q": "What are the speakers mainly discussing?",
      "choices": ["A budget report", "A schedule change", "A new employee", "A product launch"],
      "answer": 1,
      "th": { "q": "ผู้พูดกำลังคุยเรื่องอะไรเป็นหลัก", "choices": ["…","…","…","…"] },
      "explain": { "why": "…", "wrong": {"0":"…","2":"…","3":"…"}, "point": "…", "trick": "…" }
    }
    // ต้องมี 3 คำถามเสมอ
  ],
  "vocab": [ … ]
}
```

- Part 3: 2–3 คนพูด สลับกัน 6–12 บรรทัด รวม ~90–130 คำ
- Part 4: คนเดียวพูดต่อเนื่อง 1 บล็อก (`lines` มี 1 รายการ) ~90–130 คำ
  ประเภท: ประกาศ, ข้อความเสียง, โฆษณา, รายงานสภาพอากาศ/จราจร, ทัวร์แนะนำ, สุนทรพจน์เปิดงาน
- คำถามข้อ 3 ของบางชุดควรเป็นแนว "ผู้พูดหมายความว่าอย่างไรเมื่อพูดว่า …" (implication) ตามข้อสอบจริง

---

## Part 6 — Text Completion (Group: 1 บทความ 4 ช่องว่าง)

```jsonc
{
  "id": "p6m-01-001",
  "part": 6,
  "tier": "medium",
  "docType": "email",              // email | notice | article | letter | advertisement | memo
  "passage": "Dear Mr. Tanaka,\n\nThank you for your recent order. We [[1]] your shipment yesterday…\n\n[[4]]\n\nSincerely,\nLisa Chen",
  "th": { "passage": "เรียนคุณทานากะ\n\nขอบคุณสำหรับคำสั่งซื้อ…" },
  "questions": [
    { "blank": 1, "kind": "grammar",
      "choices": ["ship", "shipped", "shipping", "will ship"], "answer": 1,
      "th": { "choices": ["…","…","…","…"] },
      "explain": { "why":"…", "wrong": {"0":"…","2":"…","3":"…"}, "point":"…", "trick":"…" } }
    // ต้องมี 4 ข้อ; หนึ่งใน 4 ต้องมี "kind": "sentence" (ตัวเลือกเป็นประโยคเต็ม)
  ],
  "vocab": [ … ]
}
```

---

## Part 7 — Reading Comprehension (Group)

```jsonc
{
  "id": "p7r-01-001",
  "part": 7,
  "tier": "real",
  "setType": "single",             // single (2–4 คำถาม) | double (5 คำถาม) | triple (5 คำถาม)
  "passages": [
    {
      "kind": "email",             // email|letter|notice|advertisement|article|memo|form|invoice|schedule|chat|receipt|webpage
      "header": { "From": "…", "To": "…", "Date": "…", "Subject": "…" },  // ไม่มีก็เว้นว่าง
      "body": "…"
    }
  ],
  "th": { "passages": [ { "body": "คำแปลไทยของเนื้อความ" } ] },
  "questions": [
    { "q": "…", "choices": ["…","…","…","…"], "answer": 0,
      "kind": "detail",            // gist | detail | inference | vocab | notMentioned | insertSentence | crossRef
      "th": { "q": "…", "choices": ["…","…","…","…"] },
      "explain": {
        "why": "…",
        "wrong": { "1":"…","2":"…","3":"…" },
        "point": "…",
        "trick": "…",
        "evidence": "ประโยคภาษาอังกฤษในบทความที่เป็นหลักฐานคำตอบ (คัดลอกมาตรงๆ)"
      } }
  ],
  "vocab": [ … ]
}
```

- `single`: 1 passage 150–250 คำ, 2–4 คำถาม
- `double`: 2 passages ที่เชื่อมกัน รวม 300–400 คำ, 5 คำถาม โดยอย่างน้อย 1 ข้อ `kind: "crossRef"`
- `triple`: 3 passages รวม 400–500 คำ, 5 คำถาม โดยอย่างน้อย 2 ข้อ `kind: "crossRef"`
- ข้อ `insertSentence` = "ประโยคนี้ควรอยู่ตำแหน่งใด" → ใน `body` ให้ใส่มาร์ก `[1]` `[2]` `[3]` `[4]`

---

## Vocab (`data/vocab/*.json`)

```jsonc
{
  "meta": { "batch": "vocab-01", "week": 1, "count": 100 },
  "items": [
    {
      "id": "v0001",
      "w": "invoice",
      "ipa": "/ˈɪnvɔɪs/",
      "th": "อิน-วอยซ์",                    // คำอ่านไทย ใส่ขีดคั่นพยางค์ พยางค์ที่ลงเสียงหนักให้ตัวหนา **อิน**-วอยซ์
      "pos": "n.",
      "mean": "ใบแจ้งหนี้ (เอกสารเรียกเก็บเงินที่ผู้ขายส่งให้ผู้ซื้อ)",
      "ex": "Please send the invoice by Friday.",
      "exTh": "กรุณาส่งใบแจ้งหนี้ภายในวันศุกร์",
      "tags": ["finance", "office"],
      "freq": 5                              // 5 = ออกบ่อยที่สุด, 1 = ออกน้อย
    }
  ]
}
```

---

## Lessons (`data/lessons/*.json`)

```jsonc
{
  "id": "L01",
  "day": 1,
  "title": "ตัวอักษร เสียง และคำที่เจอทุกวันในข้อสอบ",
  "goalTh": "จบบทนี้แล้วคุณจะอ่านออกเสียงคำอังกฤษพื้นฐานได้ และรู้จักคำที่โผล่ในข้อสอบทุกชุด",
  "minutes": 25,
  "blocks": [
    { "type": "text",    "th": "ย่อหน้าอธิบายภาษาไทย" },
    { "type": "example", "en": "The meeting is at 3 PM.", "th": "การประชุมอยู่ตอนบ่าย 3", "note": "สังเกตว่า…" },
    { "type": "table",   "head": ["คำ", "คำอ่าน", "แปล"], "rows": [["office","ออฟ-ฟิศ","สำนักงาน"]] },
    { "type": "tip",     "th": "เคล็ดลับ: …" },
    { "type": "warn",    "th": "ระวัง: คนไทยมักผิดตรงนี้ …" }
  ],
  "quiz": [ /* Item แบบ Part 5 อย่างน้อย 5 ข้อ ใช้ id ขึ้นต้น "L01q-" */ ]
}
```

---

## เกณฑ์คุณภาพที่ตรวจทุกไฟล์

- [ ] คำตอบถูกต้องจริง และมีคำตอบที่ถูก **เพียงหนึ่งเดียว** (ตัวลวงต้องผิดชัดเจน ไม่กำกวม)
- [ ] `explain.wrong` ครบทุก index ที่ไม่ใช่คำตอบ
- [ ] คำแปลไทยตรงกับต้นฉบับ ไม่ตกหล่น ไม่เพี้ยนความหมาย
- [ ] ไม่มี id ซ้ำ, ไม่มีข้อซ้ำเนื้อหากับข้ออื่นในไฟล์
- [ ] ตำแหน่งคำตอบกระจาย (แต่ละ index ควรเป็นคำตอบราว 25% ของไฟล์; Part 2 ราว 33%)
- [ ] ภาษาไทยอ่านลื่น ไม่ใช่คำแปลแบบเครื่อง
