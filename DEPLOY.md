# ფინანსური Dashboard — გაშვების ინსტრუქცია

## 1. Google Sheets გაზიარება (აუცილებელი)

1. გახსენით [კალკულატორი](https://docs.google.com/spreadsheets/d/19EC29L7CgHCk4XD7AZuqbmiz0KSFv-Nl/edit)
2. **გაზიარება** (ზედა მარჯვენა) → **ინტერნეტზე ყველას**
3. როლი: **მნახველი** → **შენახვა**

---

## 2. უფასო გაშვება Vercel-ზე (რეკომენდებული)

### ნაბიჯები:

1. ატვირთეთ პროექტი **GitHub**-ზე
2. გადადით [vercel.com](https://vercel.com) → შედით Google ანგარიშით
3. **Add New Project** → აირჩიეთ რეპოზიტორი
4. **Environment Variables** დაამატეთ:

| სახელი | მნიშვნელობა |
|--------|-------------|
| `GOOGLE_SHEET_ID` | `19EC29L7CgHCk4XD7AZuqbmiz0KSFv-Nl` |
| `GOOGLE_SHEET_GID_COST` | `1981413768` |
| `ADMIN_PIN` | `12345` |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-APP.vercel.app` (დეპლოის შემდეგ) |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Blob → Create → Token |

5. **Deploy** → მიიღებთ ლინკს: `https://your-app.vercel.app`

6. დეპლოის შემდეგ განაახლეთ `NEXT_PUBLIC_APP_URL` თქვენი ნამდვილი ლინკით და **Redeploy**

### Blob Token-ის მიღება:
Vercel Dashboard → თქვენი პროექტი → **Storage** → **Create Database** → **Blob** → **Connect** → დააკოპირეთ `BLOB_READ_WRITE_TOKEN`

---

## 3. ლოკალურად გაშვება

```bash
cp .env.example .env.local
npm install
npm run dev
```

გახსენით: http://localhost:3000

---

## 4. Docker (სერვერი/VPS)

```bash
docker compose up -d
```

მონაცემები: `data/store.json`

---

## ფილიალის ლინკები

ადმინ პანელში → **ფილიალები** ტაბი:
- ქუთაისი: `https://YOUR-APP.vercel.app/f/kut-a8f3`
- ლილო: `https://YOUR-APP.vercel.app/f/lil-b2c9`
- დიღომი: `https://YOUR-APP.vercel.app/f/dig-c5e1`

---

## რა სად იცვლება

| რა | სად |
|----|-----|
| პროდუქტები/ფასები | Google Sheets (ავტომატურად) |
| გაყიდვები/ხარჯები | Vercel Blob ან `data/store.json` |
| ადმინის კოდი | `ADMIN_PIN` env ცვლადი |
| აპის მისამართი | `NEXT_PUBLIC_APP_URL` |

---

## Google Cloud (ალტერნატივა)

```bash
gcloud run deploy fin-dashboard --source . --region europe-west1 --allow-unauthenticated
```

დაამატეთ env ცვლადები Cloud Run კონსოლში.
