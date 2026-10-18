# Payment proof print output

## Rendering decision

Proofs remain rendered in the browser and saved through the browser's
print-to-PDF flow. The proof is generated from the invoice already loaded by
the page, so no new service needs to receive invoice or payer details. A
server-side PDF renderer can be reconsidered if the browser matrix below finds
material differences that print CSS cannot fix; it is not required for this
release.

The proof document and app shell both define print rules. They preserve
background and border colors, remove controls and navigation, and keep proof
rows and panels together across page breaks. The stylesheet uses both
`print-color-adjust` and its WebKit-prefixed form for browser coverage.

## Browser PDF review

For release review, use the same paid proof fixture in current Chrome, Firefox,
and Safari. In each browser, save an actual PDF with the default print settings
and check:

- invoice ID, amount, asset, seller, payer, transaction hash, and timestamps are
  present once and legible;
- no row is clipped or duplicated at a page boundary;
- borders and other legibility-critical colors remain visible;
- print controls, site navigation, and browser-only actions are absent.

Record the browser and version, operating system, and PDF artifact with the
review. A print preview alone does not count as a PDF review.
