import JSZip from 'jszip';
import { renderAsync } from 'docx-preview';

const NS = {
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  officeRel: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  word: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  drawing: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  picture: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
};

export async function previewDocx(file, container) {
  container.innerHTML = '';
  await renderAsync(file, container, container, {
    className: 'docx', inWrapper: true, breakPages: true,
    ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true,
  });
  return [...container.querySelectorAll('.docx-wrapper section.docx, section.docx')];
}

function getPageElements(container) {
  return [...container.querySelectorAll('.docx-wrapper section.docx, section.docx')];
}

export function paintDocxStampOverlays(container, stampDataUrl, position, stampAspect = 480 / 143) {
  const pages = getPageElements(container);
  const stampHeight = 0.36 / stampAspect;
  pages.forEach((page) => {
    page.style.position = 'relative';
    let overlay = page.querySelector(':scope > .ow-stamp-overlay');
    if (!position || !stampDataUrl) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement('img');
      overlay.className = 'ow-stamp-overlay';
      overlay.alt = 'OrcaWarden stamp placement preview';
      overlay.draggable = false;
      page.append(overlay);
    }
    overlay.src = stampDataUrl;
    overlay.style.left = `${Math.min(position.x, 0.64) * 100}%`;
    overlay.style.top = `${Math.min(position.y, 1 - stampHeight) * 100}%`;
    overlay.style.width = '36%';
  });
  return pages;
}

function decodeDataUrl(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`(?:^|\\s)${escaped}=["']([^"']*)["']`))?.[1] || null;
}

function relationshipTags(xml) {
  return [...xml.matchAll(/<Relationship\b[^>]*\/>/g)].map((match) => match[0]);
}

function nextRelationshipId(xml, prefix) {
  const used = new Set(relationshipTags(xml).map((tag) => getAttribute(tag, 'Id')));
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function appendRelationship(xml, id, type, target) {
  const relation = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
  return xml.replace('</Relationships>', `${relation}</Relationships>`);
}

function relationshipTarget(xml, id, typeSuffix) {
  const tag = relationshipTags(xml).find((candidate) =>
    getAttribute(candidate, 'Id') === id && getAttribute(candidate, 'Type')?.endsWith(typeSuffix));
  return tag ? getAttribute(tag, 'Target') : null;
}

function resolveHeaderPath(target) {
  const segments = target.startsWith('/') ? [] : ['word'];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments.join('/');
}

function relsPathForPart(partPath) {
  const leaf = partPath.split('/').pop();
  return `word/_rels/${leaf}.rels`;
}

function ensureNamespace(openTag, prefix, uri) {
  if (new RegExp(`\\bxmlns:${prefix}=`).test(openTag)) return openTag;
  return openTag.replace(/>$/, ` xmlns:${prefix}="${uri}">`);
}

function ensureHeaderRootNamespaces(xml) {
  const namespaces = { w: NS.word, r: NS.officeRel, wp: NS.wp, a: NS.drawing, pic: NS.picture };
  if (!xml.includes('</w:hdr>')) {
    xml = xml.replace(/<w:hdr\b([^>]*)\/>/, '<w:hdr$1></w:hdr>');
  }
  return xml.replace(/<w:hdr\b[^>]*>/, (openTag) =>
    Object.entries(namespaces).reduce((tag, [prefix, uri]) => ensureNamespace(tag, prefix, uri), openTag));
}

function stampDrawing(relId, xEmu, yEmu, widthEmu, heightEmu, docPrId) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(xEmu)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${Math.round(yEmu)}</wp:posOffset></wp:positionV><wp:extent cx="${Math.round(widthEmu)}" cy="${Math.round(heightEmu)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${docPrId}" name="OrcaWarden Document Stamp ${docPrId}" descr="OrcaWarden QR, Data Matrix and PDF417 document mark"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="OrcaWarden stamp"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(widthEmu)}" cy="${Math.round(heightEmu)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
}

function addDrawingToHeader(xml, drawing) {
  xml = ensureHeaderRootNamespaces(xml);
  if (!xml.includes('</w:hdr>')) throw new Error('This Word file has an unsupported header structure.');
  return xml.replace('</w:hdr>', `${drawing}</w:hdr>`);
}

function addHeaderReference(sectionXml, type, relationId) {
  if (/^<w:sectPr\b[^>]*\/>$/.test(sectionXml)) {
    sectionXml = sectionXml.replace(/^<w:sectPr\b([^>]*)\/>$/, '<w:sectPr$1></w:sectPr>');
  }
  const reference = `<w:headerReference w:type="${type}" r:id="${relationId}"/>`;
  const pattern = new RegExp(`<w:headerReference\\b(?=[^>]*\\bw:type=["']${type}["'])[^>]*/>`);
  if (pattern.test(sectionXml)) return sectionXml.replace(pattern, reference);
  return sectionXml.replace(/<w:sectPr\b[^>]*>/, (openTag) => `${openTag}${reference}`);
}

function ensurePngContentType(xml) {
  if (!/<Default\b[^>]*Extension=["']png["']/.test(xml)) {
    xml = xml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  }
  return xml;
}

function ensureHeaderContentType(xml, partPath) {
  const partName = `/${partPath}`;
  if (!xml.includes(`PartName="${partName}"`)) {
    xml = xml.replace('</Types>', `<Override PartName="${partName}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`);
  }
  return xml;
}

function sectionGeometry(sectionXml, fallbackPageSize, stampAspect, position) {
  const pageSizeTag = sectionXml.match(/<w:pgSz\b[^>]*\/?\s*>/)?.[0];
  const widthTwips = Number(getAttribute(pageSizeTag || '', 'w:w'));
  const heightTwips = Number(getAttribute(pageSizeTag || '', 'w:h'));
  const pageWidthEmu = widthTwips > 0 ? widthTwips * 635 : (fallbackPageSize?.width || 816) * 9525;
  const pageHeightEmu = heightTwips > 0 ? heightTwips * 635 : (fallbackPageSize?.height || 1056) * 9525;
  const stampWidthEmu = pageWidthEmu * 0.44;
  const stampHeightEmu = stampWidthEmu / stampAspect;
  const x = Math.min(Math.max(position.x, 0), 0.64);
  const y = Math.min(Math.max(position.y, 0), 1 - stampHeightEmu / pageHeightEmu);
  return {
    xEmu: x * pageWidthEmu,
    yEmu: y * pageHeightEmu,
    widthEmu: stampWidthEmu,
    heightEmu: stampHeightEmu,
  };
}

async function cloneOrCreateHeader(zip, sourceHeaderPath, newHeaderPath) {
  const source = sourceHeaderPath ? zip.file(sourceHeaderPath) : null;
  let headerXml = source
    ? await source.async('string')
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${NS.word}" xmlns:r="${NS.officeRel}" xmlns:wp="${NS.wp}" xmlns:a="${NS.drawing}" xmlns:pic="${NS.picture}"><w:p/></w:hdr>`;
  if (source) {
    const sourceRels = zip.file(relsPathForPart(sourceHeaderPath));
    if (sourceRels) zip.file(relsPathForPart(newHeaderPath), await sourceRels.async('string'));
  }
  return headerXml;
}

function uniquePartPath(zip, sectionIndex, type) {
  let suffix = 1;
  let path;
  do {
    path = `word/header-orcawarden-section${sectionIndex + 1}-${type}-${suffix}.xml`;
    suffix += 1;
  } while (zip.file(path));
  return path;
}

function cloneMediaName(zip) {
  let index = 1;
  let path;
  do {
    path = `word/media/orcawarden-document-stamp-${index}.png`;
    index += 1;
  } while (zip.file(path));
  return path;
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function textParagraph(value, { centered = false, style = '', before = 0, after = 0 } = {}) {
  const pPr = `${centered ? '<w:jc w:val="center"/>' : ''}${style ? `<w:pStyle w:val="${style}"/>` : ''}${before || after ? `<w:spacing w:before="${before}" w:after="${after}"/>` : ''}`;
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`;
}

function inlineStampDrawing(relId, widthEmu, heightEmu, docPrId) {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="Attachment stamp ${docPrId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Attachment stamp"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function ensureDocumentNamespaces(xml) {
  return xml.replace(/<w:document\b[^>]*>/, (tag) => Object.entries({ r: NS.officeRel, wp: NS.wp, a: NS.drawing, pic: NS.picture }).reduce((value, [prefix, uri]) => ensureNamespace(value, prefix, uri), tag));
}

async function attachmentAppendix(zip, attachments, documentRels, contentTypes, docPrCounter, pageWidth, pageHeight, pageMargins) {
  const pages = [];
  const tableWidth = Math.max(3600, pageWidth - pageMargins.left - pageMargins.right);
  const cellWidth = Math.floor(tableWidth / 4);
  const imageWidth = Math.floor(cellWidth * 635 * 0.92);
  const rowHeight = Math.max(1500, Math.floor((pageHeight - pageMargins.top - pageMargins.bottom - 1700) / 4));
  for (let start = 0; start < attachments.length; start += 16) {
    const chunk = attachments.slice(start, start + 16);
    const columns = Array.from({ length: 4 }, () => `<w:gridCol w:w="${cellWidth}"/>`).join('');
    let table = `<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="35" w:type="dxa"/><w:left w:w="35" w:type="dxa"/><w:bottom w:w="35" w:type="dxa"/><w:right w:w="35" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${columns}`;
    for (let row = 0; row < 4; row += 1) {
      table += `<w:tr><w:trPr><w:trHeight w:val="${rowHeight}" w:hRule="atLeast"/></w:trPr>`;
      for (let col = 0; col < 4; col += 1) {
        const item = chunk[row * 4 + col];
        let cell = '<w:p/>';
        if (item) {
          const fileName = typeof item.fileName === 'string' ? item.fileName : '';
          const imageData = item.stamp?.dataUrl || item.stampDataUrl || item.dataUrl;
          if (!imageData) throw new Error(`Attachment “${fileName}” is missing its stamp image.`);
          const imageName = cloneMediaName(zip).split('/').pop();
          zip.file(`word/media/${imageName}`, decodeDataUrl(imageData));
          const relId = nextRelationshipId(documentRels, 'rIdOrcaWardenAttachment');
          documentRels = appendRelationship(documentRels, relId, `${NS.officeRel}/image`, `media/${imageName}`);
          contentTypes = ensurePngContentType(contentTypes);
          const aspect = item.stamp?.width && item.stamp?.height ? item.stamp.width / item.stamp.height : 480 / 143;
          const width = imageWidth;
          const height = Math.round(width / aspect);
          cell = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${inlineStampDrawing(relId, width, height, docPrCounter.value++)}</w:p><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(fileName)}</w:t></w:r></w:p>`;
        }
        table += `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${cell}</w:tc>`;
      }
      table += '</w:tr>';
    }
    table += '</w:tbl>';
    pages.push(`${start ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ''}${textParagraph('Attachments Stamps', { centered: true, style: 'Title' })}${textParagraph('Kindly verify all attachments against their respective stamps only.', { centered: true })}${table}`);
  }
  return { xml: pages.join(''), documentRels, contentTypes };
}

async function addStampToSection({ zip, sectionXml, sectionIndex, activeHeaderTypes, documentRels, contentTypes, imageName, stamp, stampAspect, position, pageSize, docPrCounter }) {
  let updatedSection = sectionXml;
  let nextDocumentRels = documentRels;
  let nextContentTypes = contentTypes;
  for (const type of activeHeaderTypes) {
    const referencePattern = new RegExp(`<w:headerReference\\b(?=[^>]*\\bw:type=["']${type}["'])[^>]*/>`);
    const reference = updatedSection.match(referencePattern)?.[0];
    const existingRelationId = reference ? getAttribute(reference, 'r:id') : null;
    const existingTarget = existingRelationId ? relationshipTarget(nextDocumentRels, existingRelationId, '/header') : null;
    const sourceHeaderPath = existingTarget ? resolveHeaderPath(existingTarget) : null;
    const headerPath = uniquePartPath(zip, sectionIndex, type);
    const headerTarget = headerPath.slice('word/'.length);
    const documentRelationId = nextRelationshipId(nextDocumentRels, `rIdOrcaWardenHeaderS${sectionIndex + 1}${type}`);
    const headerRelsPath = relsPathForPart(headerPath);
    const headerXmlSource = await cloneOrCreateHeader(zip, sourceHeaderPath, headerPath);
    let headerRels = zip.file(headerRelsPath) ? await zip.file(headerRelsPath).async('string') : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}"></Relationships>`;
    const imageRelationId = nextRelationshipId(headerRels, `rIdOrcaWardenStampS${sectionIndex + 1}${type}`);
    headerRels = appendRelationship(headerRels, imageRelationId, `${NS.officeRel}/image`, `media/${imageName}`);
    zip.file(headerRelsPath, headerRels);
    const geometry = sectionGeometry(updatedSection, pageSize, stampAspect, position);
    const headerXml = addDrawingToHeader(headerXmlSource, stampDrawing(imageRelationId, geometry.xEmu, geometry.yEmu, geometry.widthEmu, geometry.heightEmu, docPrCounter.value++));
    zip.file(headerPath, headerXml);
    nextDocumentRels = appendRelationship(nextDocumentRels, documentRelationId, `${NS.officeRel}/header`, headerTarget);
    nextContentTypes = ensureHeaderContentType(nextContentTypes, headerPath);
    updatedSection = addHeaderReference(updatedSection, type, documentRelationId);
  }
  return { sectionXml: updatedSection, documentRels: nextDocumentRels, contentTypes: nextContentTypes };
}

export async function exportStampedDocx(file, stamp, coverTitle = '', coverBody = '', attachments = []) {
  const zip = await JSZip.loadAsync(file);
  const mainPart = zip.file('word/document.xml');
  if (!mainPart) throw new Error('This Word document is missing its main document part.');
  let documentXml = await mainPart.async('string');
  let documentRels = zip.file('word/_rels/document.xml.rels')
    ? await zip.file('word/_rels/document.xml.rels').async('string')
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}"></Relationships>`;
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (!contentTypesFile) throw new Error('This Word file has an unsupported package structure.');
  let contentTypes = await contentTypesFile.async('string');
  const imageName = cloneMediaName(zip).split('/').pop();
  zip.file(`word/media/${imageName}`, decodeDataUrl(stamp.dataUrl));
  contentTypes = ensurePngContentType(contentTypes);
  const stampAspect = stamp.width / stamp.height;
  const sections = [...documentXml.matchAll(/<w:sectPr\b[^>]*(?:\/>|>[\s\S]*?<\/w:sectPr>)/g)];
  const docPrCounter = { value: 84001 };

  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  if (!/<w:body\b[^>]*>/.test(documentXml)) throw new Error('This Word document has an unsupported body structure.');
  const cover = `${coverTitle ? textParagraph(coverTitle, { centered: true, style: 'Title', before: 5200, after: 480 }) : ''}${coverBody ? textParagraph(coverBody, { centered: true }) : ''}${pageBreak}`;
  documentXml = documentXml.replace(/(<w:body\b[^>]*>)/, `$1${cover}`);
  let firstSection = sections[0]?.[0] || '<w:sectPr></w:sectPr>';
  if (/^<w:sectPr\b[^>]*\/>$/.test(firstSection)) {
    firstSection = firstSection.replace(/^<w:sectPr\b([^>]*)\/>$/, '<w:sectPr$1></w:sectPr>');
  }
  if (!/<w:titlePg\b/.test(firstSection)) {
    firstSection = firstSection.replace('</w:sectPr>', '<w:titlePg/></w:sectPr>');
  }
  const firstGeometry = firstSection.match(/<w:pgSz\b[^>]*\/>/)?.[0];
  const widthTwips = Number(getAttribute(firstGeometry || '', 'w:w'));
  const heightTwips = Number(getAttribute(firstGeometry || '', 'w:h'));
  const pageWidth = widthTwips > 0 ? widthTwips : 12240;
  const pageHeight = heightTwips > 0 ? heightTwips : 15840;
  const stampHeightRatio = 0.44 * pageWidth / pageHeight / stampAspect;
  const coverPosition = { x: 0.28, y: 1 - stampHeightRatio - 0.05 };
  const updated = await addStampToSection({
    zip, sectionXml: firstSection, sectionIndex: 0, activeHeaderTypes: ['first'],
    documentRels, contentTypes, imageName, stamp, stampAspect, position: coverPosition,
    pageSize: { width: pageWidth / 1440 * 96, height: pageHeight / 1440 * 96 }, docPrCounter,
  });
  documentRels = updated.documentRels;
  contentTypes = updated.contentTypes;

  if (sections.length) {
    let index = 0;
    documentXml = documentXml.replace(/<w:sectPr\b[^>]*(?:\/>|>[\s\S]*?<\/w:sectPr>)/g, () => {
      index += 1;
      return index === 1 ? updated.sectionXml : sections[index - 1][0];
    });
  } else {
    documentXml = documentXml.replace('</w:body>', `${updated.sectionXml}</w:body>`);
  }

  if (attachments?.length) {
    const appendixSection = sections.at(-1)?.[0] || firstSection;
    const pgSz = appendixSection.match(/<w:pgSz\b[^>]*\/>/)?.[0] || '';
    const pgMar = appendixSection.match(/<w:pgMar\b[^>]*\/>/)?.[0] || '';
    const appendix = await attachmentAppendix(
      zip, attachments, documentRels, contentTypes, docPrCounter,
      Number(getAttribute(pgSz, 'w:w')) || 12240,
      Number(getAttribute(pgSz, 'w:h')) || 15840,
      {
        left: Number(getAttribute(pgMar, 'w:left')) || 1440,
        right: Number(getAttribute(pgMar, 'w:right')) || 1440,
        top: Number(getAttribute(pgMar, 'w:top')) || 1440,
        bottom: Number(getAttribute(pgMar, 'w:bottom')) || 1440,
      },
    );
    documentRels = appendix.documentRels;
    contentTypes = appendix.contentTypes;
    documentXml = ensureDocumentNamespaces(documentXml);
    const bodyClose = documentXml.lastIndexOf('</w:body>');
    const trailingSectPr = documentXml.slice(0, bodyClose).match(/<w:sectPr\b[^>]*(?:\/>|>[\s\S]*?<\/w:sectPr>)\s*$/);
    const insertAt = trailingSectPr ? trailingSectPr.index : bodyClose;
    documentXml = `${documentXml.slice(0, insertAt)}${pageBreak}${appendix.xml}${documentXml.slice(insertAt)}`;
  }
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', documentRels);
  zip.file('[Content_Types].xml', contentTypes);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
