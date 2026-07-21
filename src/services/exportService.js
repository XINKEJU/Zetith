import { exportCategoryToJSON } from '../db/database'

// Generate .docx using minimal Office Open XML without external dependencies
export async function exportCategoryToDocx(categoryId) {
  const data = exportCategoryToJSON(categoryId)
  if (!data) return

  const { questions, category } = data
  const optLetters = ['A', 'B', 'C', 'D']
  
  let bodyXml = ''
  
  bodyXml += `<w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">${esc(category.name)}</w:t></w:r></w:p>`
  bodyXml += `<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">共 ${questions.length} 题</w:t></w:r></w:p>`
  bodyXml += `<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    
    bodyXml += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${i + 1}. [${q.question_type}] ${esc(q.stem)}</w:t></w:r></w:p>`
    
    for (let j = 0; j < 4; j++) {
      const key = optLetters[j].toLowerCase()
      const text = q[`option_${key}`]
      if (text) {
        bodyXml += `<w:p><w:r><w:t xml:space="preserve">    ${optLetters[j]}. ${esc(text)}</w:t></w:r></w:p>`
      }
    }
    
    bodyXml += `<w:p><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="888888"/></w:rPr><w:t xml:space="preserve">答案: ${q.answer} | 难度: ${q.difficulty || '适中'}</w:t></w:r></w:p>`
    
    if (q.explanation) {
      bodyXml += `<w:p><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="888888"/></w:rPr><w:t xml:space="preserve">解析: ${esc(q.explanation)}</w:t></w:r></w:p>`
    }
    
    bodyXml += `<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`

  const [types, rels, contentTypes] = buildOOXML(docXml)
  
  const zipData = buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: docXml },
  ])

  downloadBlob(zipData, `${category.name}_${new Date().toISOString().slice(0, 10)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildOOXML(docXml) {
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  return [types, rels]
}

function buildZip(files) {
  // Full .docx is a ZIP. Create a minimal valid ZIP with stored entries.
  const encoder = new TextEncoder()
  const entries = []
  let offset = 0

  for (const { name, data } of files) {
    const bytes = encoder.encode(data)
    const crc = crc32(bytes)
    
    // Local file header
    const localHeader = new Uint8Array(30 + name.length)
    const lh = new DataView(localHeader.buffer)
    lh.setUint32(0, 0x04034b50, true) // signature
    lh.setUint16(4, 20, true) // version
    lh.setUint16(6, 0, true) // flags
    lh.setUint16(8, 0, true) // compression (stored)
    lh.setUint16(10, 0, true) // mod time
    lh.setUint16(12, 0, true) // mod date
    lh.setUint32(14, crc, true)
    lh.setUint32(18, bytes.length, true) // compressed size
    lh.setUint32(22, bytes.length, true) // uncompressed size
    lh.setUint16(26, name.length, true)
    lh.setUint16(28, 0, true) // extra field length
    localHeader.set(encoder.encode(name), 30)

    // Central directory entry
    const cdEntry = new Uint8Array(46 + name.length)
    const cd = new DataView(cdEntry.buffer)
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0, true)
    cd.setUint16(10, 0, true)
    cd.setUint32(12, 0, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, bytes.length, true)
    cd.setUint32(24, bytes.length, true)
    cd.setUint16(28, name.length, true)
    cd.setUint16(30, 0, true)
    cd.setUint16(32, 0, true)
    cd.setUint16(34, 0, true)
    cd.setUint32(36, 0, true)
    cd.setUint32(40, 0, true)
    cd.setUint32(42, offset, true)
    cdEntry.set(encoder.encode(name), 46)

    entries.push({ localHeader, data: bytes, cdEntry })
    offset += 30 + name.length + bytes.length
  }

  const cdOffset = offset
  let cdSize = 0
  const cdParts = []
  for (const e of entries) {
    cdParts.push(e.cdEntry)
    cdSize += e.cdEntry.length
  }

  // EOCD
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdOffset, true)
  ev.setUint16(20, 0, true)

  let totalSize = offset
  totalSize += cdSize + 22
  const result = new Uint8Array(totalSize)
  let pos = 0
  for (const e of entries) {
    result.set(e.localHeader, pos); pos += e.localHeader.length
    result.set(e.data, pos); pos += e.data.length
  }
  for (const c of cdParts) {
    result.set(c, pos); pos += c.length
  }
  result.set(eocd, pos)
  
  return result
}

function crc32(data) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xEDB88320
      else crc >>>= 1
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function downloadBlob(data, filename, mime) {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click(); URL.revokeObjectURL(url)
}
