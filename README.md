# Origin Billing

Shop billing for **Origin — Street Culture, Visakhapatnam**. The same billing app as Vault 26, with Origin's own products, look and bill numbers. Origin has no online store yet, so it is shown as **coming soon** wherever sales are counted.

**What it does**

- **New bill** – pick items by colour and size (or scan the barcode), add a discount, take cash / UPI / card / split payment, print the bill (80 mm) or an A4 GST invoice.
- **Bill QR code** – scanning the QR on a printed bill opens that bill as a web page that looks exactly like the print (same layout, CSS and fonts). No sign-in needed; the phone needs internet. Cancelled bills are marked.
- **All bills** – reprint or cancel a bill (stock goes back).
- **Products & stock**, managed here:
  1. **Categories & sizes** – add a category (Shirts) and the sizes it comes in (S, M, L, XL), in order.
  2. **Add product** – name, photo, category and price; tick the sizes this product comes in; type its colours; enter the pieces for each colour × size (Red / S = 10, Blue / S = 9). Each colour × size can have its own price.
  3. Later: edit details, add colours or sizes, change one price, add or remove stock (with history), delete.
- **Customers** – name and phone, their bills, optional GSTIN.
- **Price tags** – hang tag, sticker or box label with barcode.
- **Check sales** – shop sales, the cash count for the drawer, discounts per staff member, printable report.
- **Monthly GST report** – one PDF with every shop bill of the month, CGST / SGST / IGST totals.
- **Settings & staff** – shop details printed on bills, GST slab, printer, staff logins (username + password) and what each person can open. The owner can also change a saved bill.
- **Black & white / Red & white** theme switch and **English / తెలుగు** switch on every screen (printed bills stay black and white, in English).

## Bill numbers

Shop bills: `ORS-YYMM-0001` (restarts every month). Numbers come from the database, so there are no gaps.

## Set up

1. **Database** – Supabase SQL editor, every file in `db/migrations/` in order (`0001` … `0008`), then `db/first_owner.sql` with the owner's email and password filled in (not committed).
2. **Shop details** – sign in as the owner → Settings & staff → Shop details. The address and phone are already filled in; add the **GSTIN** before giving GST bills.
3. **App**
   ```bash
   cp .env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (Supabase → Project Settings → API)
   npm ci
   npm run dev            # local
   npm run build          # for hosting (dist/)
   ```

### Deploy on Vercel

`vercel.json` has everything the build needs (Vite, `dist/`, every route served by the app so `/bill/<id>` links work, Node 22).

1. Vercel → **Add New → Project** → import `originstreets/origin-streets-billing`.
2. **Environment Variables** (Production and Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - optional `VITE_PUBLIC_APP_URL` – the address printed bills' QR codes open (e.g. a custom domain). Left out, the QR uses whatever address the app is running on when the bill is printed, so print from the deployed app, not from a local copy.
3. **Deploy.** Only the two `VITE_` values go to Vercel – never the access token or database password from `.env`.

## Staff logins

The owner adds them in Settings & staff → Add staff (name, username, password, job, screens). The database makes the login in one step (`pos_create_staff_login`); no email is sent and nobody types an email. Staff sign in with just the username.

## Code map

- `src/pages/` – one folder per screen; `src/pages/products/` has Categories & sizes, Add product and the product page; `src/pages/public/PublicBillPage.tsx` is the page the bill QR opens
- `src/api/pos.ts` – products, categories, sizes, bills, customers, staff, stock; `src/api/shop.ts` – shop details; `src/api/publicBill.ts` – one bill for the QR page; `src/api/monthlyReport.ts` – GST report data
- `src/services/store.ts` – the app's shared state
- `src/theme/` – the two colour themes; `tailwind.config.js` + `src/index.css` hold the colour tokens
- `src/i18n/` – the language switch; `te.ts` holds every Telugu sentence (the English sentence is the key)
- `src/utils/receiptPrinter.ts` – the 80 mm bill and A4 invoice (used for printing and for the QR page); `src/utils/billQr.ts` – the bill QR link
- `db/migrations/` – the whole database (accounts, catalogue, billing, products, staff logins, public bill)

Developed and maintained by [AR Tech Studio](https://artechstudio.co.in).
