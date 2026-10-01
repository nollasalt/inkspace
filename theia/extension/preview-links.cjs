const URI = require('@theia/core/lib/common/uri').default;
const { PreviewLinkNormalizer } = require('@theia/preview/lib/browser/preview-link-normalizer');

// markdown-it encodes Unicode and spaces before calling the preview normalizer.
// Parse that URL once; passing its encoded string to Path.resolve encodes it twice.
class InkspacePreviewLinkNormalizer extends PreviewLinkNormalizer {
  constructor(environment) { super(); this.miniBrowserEnvironment = environment; }
  normalizeLink(documentUri, link) {
    if (this.urlScheme.test(link) || link.startsWith('//') || link.startsWith('#')) {
      return super.normalizeLink(documentUri, link);
    }
    try {
      const reference = new URI(link);
      const decoded = reference.path.toString();
      const relative = link.startsWith('/') ? decoded : decoded.replace(/^\//, '');
      const resource = documentUri.parent.resolve(relative);
      return this.miniBrowserEnvironment.getEndpoint('normalized-link').getRestUrl()
        .resolve(resource.path.toString()).withQuery(reference.query).withFragment(reference.fragment).toString();
    } catch { return super.normalizeLink(documentUri, link); }
  }
}
module.exports = InkspacePreviewLinkNormalizer;
