// Block adapters are independent of DOM, selection state and file I/O.
// PDF assets own bytes; PDF page blocks own geometry and a source page index.
(function (root) {
  function textFormat(note) {
    return note.format === 'html' || note.kind === 'html' ? 'html' : 'md';
  }
  function pageId(asset, page, index) {
    return page.id || `${asset.id}-page-${index + 1}`;
  }
  function canonicalPage(asset, page, index) {
    return {...page, id: pageId(asset, page, index), pageIndex: page.pageIndex ?? index};
  }
  function pages(document) {
    return (document.pdfs || []).flatMap(asset => asset.pages.map((page, index) => ({
      ...canonicalPage(asset, page, index), assetId: asset.id
    })));
  }
  function list(document, kind) {
    return kind === 'pdfPages' ? pages(document) : document[kind] || [];
  }
  function get(document, kind, key) {
    return kind === 'pdfPages' ? pages(document).find(p => p.id === key) : document[kind]?.[key];
  }
  function key(kind, item, index) {
    return kind === 'pdfPages' ? item.id : index;
  }
  function updatePage(document, id, transform) {
    document.pdfs = (document.pdfs || []).map(asset => {
      if (!asset.pages.some((p, i) => pageId(asset, p, i) === id)) return asset;
      return {...asset, pages: asset.pages.map((p, i) => {
        const page = canonicalPage(asset, p, i);
        return page.id === id ? transform(page) : page;
      })};
    });
  }
  function removePages(document, ids) {
    const deleted = new Set(ids);
    const groups = (document.groups || []).map(group => ({...group, members: groupMembers(document, group)}));
    document.pdfs = (document.pdfs || []).map(asset => ({
      ...asset,
      pages: asset.pages.map((p, i) => canonicalPage(asset, p, i)).filter(p => !deleted.has(p.id))
    })).filter(a => a.pages.length);
    if (document.groups) document.groups = groups.map(group => ({...group,
      members: group.members.filter(ref => ref.kind !== 'pdfPages' || !deleted.has(ref.id))
    })).filter(group => group.members.length > 1);
  }
  function insertAssets(document, assets, reuse) {
    const aliases = new Map();
    let current = document.pdfs || [];
    for (const asset of assets) {
      const existing = reuse && current.find(item => item.data === asset.data && item.name === asset.name);
      if (existing) {
        aliases.set(asset.id, existing.id);
        current = current.map(item => item === existing ? {...item,
          pages: [...item.pages.map((page, index) => canonicalPage(item, page, index)), ...asset.pages]
        } : item);
      } else current = [...current, asset];
    }
    document.pdfs = current;
    return aliases;
  }
  function fragment(document, ids) {
    const wanted = new Set(ids);
    return (document.pdfs || []).map(asset => ({
      ...asset,
      pages: asset.pages.flatMap((p, i) => wanted.has(pageId(asset, p, i)) ?
        [canonicalPage(asset, p, i)] : [])
    })).filter(a => a.pages.length);
  }
  function legacyReferences(document, refs) {
    return refs.flatMap(r => r.kind === 'pdfs' ?
      pages(document).filter(p => p.assetId === r.id).map(p => ({kind: 'pdfPages', id: p.id})) : r);
  }
  function groupMembers(document, group) {
    return legacyReferences(document, group.members);
  }
  const api = {insertAssets, groupMembers, textFormat, pageId, pages, list, get, key, updatePage, removePages, fragment, legacyReferences};
  if (typeof module === 'object') module.exports = api;
  else root.InkBlockModel = api;
})(globalThis);
