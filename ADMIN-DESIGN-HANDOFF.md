# Admin workspace redesign

Design date: 8 November 2026.

Figma: https://www.figma.com/design/wir0QvAS1LoTGuiSebRZCp

## Direction

Designed for a single primary administrator whose main work is payments and teacher payouts. The overview should surface paid orders with missing access, unpaid teacher earnings, and bank details needing review before secondary statistics.

Preserve ThinkRight's Manrope body type, Space Grotesk headings, blue and neutral colours, restrained borders, 6px control corners, and 44px touch targets. Use spacing and headings to organise sections instead of putting every element inside a card.

## Completed in Figma

Seventeen editable desktop/mobile screen pairs (34 screens): overview, payments, payment details, payouts, record teacher payout, reviews, review class, teachers, teacher application, content, edit textbook, announcements, activity, payment reconciliation, analytics, More, and confirmations/states.

Reusable buttons and local colour variables are included. Desktop screens are 1280px wide; mobile screens are 390px wide. The review screen places evidence beside the decision form on desktop. Mobile filters and summaries were compacted after an initial screenshot review.

The screens use fictional sample names, references and amounts. Buttons are design elements, not working backend actions. Prototype navigation has not been wired.

## Behaviour to preserve in implementation

- Show payment status and class access separately. A paid order needing access must be obvious; a pending payment must not count as revenue.
- Payout recording records a bank transfer already completed outside ThinkRight. It must not imply that clicking the button sends money.
- Show teacher earnings at 90% for new earnings while preserving historical rates.
- A payout record reversal corrects the ledger; it does not reverse a bank transfer. Keep the original record and explanation visible.
- Approving a class at its proposed price can publish it. A changed price requires teacher acceptance before publication.
- Retiring a class prevents new purchases while preserving existing paid access.
- Announcements need audience and recipient confirmation before sending.
- Keep Overview, Reviews, Teachers, Payouts and More in the primary mobile navigation. Payments must also be directly accessible from the overview and More.
- Implement reduced-motion support, visible keyboard focus, labelled icon controls, and responsive layouts rather than fixed canvas dimensions.

## Still to finish

Figma's Starter MCP allowance stopped the next write. The following dedicated screens were not created: transfer history, bank-detail review, class-removal review, news editor, announcement preview, and all classes. Their entry points appear in the completed designs where applicable.

Also pending: final screenshots after the compact-layout refinements, prototype links, narrow-width/long-content checks, and implementation in the website. Earlier screenshots predate those refinements and should not be treated as final exports.

No production payments, payouts, approvals or announcements were performed during this design work. No website implementation changes were made as part of this Figma pass. GitHub pushes remain paused.

## Local implementation — 9 November 2026

Implemented manually with owner approval after Figma reads remained quota-blocked. The admin shell now prioritises payments and payouts, with compact responsive records, payout balances/history views, payment filters and details, and evidence/decision columns for wide class reviews. Existing privileged actions remain connected to their original handlers. Shared styles cover content, announcements, teacher applications, activity and reconciliation. This is an adaptation from the saved design, not a verified pixel match. Browser access timed out; browser visual review remains outstanding. No GitHub push or production deployment was performed.
