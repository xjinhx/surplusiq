"""Generates 3 months (Aug-Oct 2026) of Kopi & Co Pte Ltd transactions.

Outputs
  data/KopiCo_Transactions_Aug-Oct2026.xlsx   (hand to the team / import into OutSystems)

Deterministic (fixed seed). Monthly totals are forced to hit fixed targets so the demo numbers
are exact: closing cash S$420,000 and average monthly outflow S$60,000 (=> 3-month buffer S$180,000).
Run:  python scripts/generate_seed.py
"""
import json, random, zlib, datetime as dt
from collections import defaultdict
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

random.seed(2026)
ROOT = Path(__file__).resolve().parent.parent
CA, SA = "SMU-CA-0001", "SMU-SV-0002"
MONTHS = [(2026, 8, 31), (2026, 9, 30), (2026, 10, 31)]
IN_TARGET = [63500.00, 65500.00, 67000.00]
OUT_TARGET = [56500.00, 59500.00, 64000.00]   # mean = 60,000.00
CA_CLOSE, SA_CLOSE = 380000.00, 40000.00      # => total cash 420,000


def d(y, m, day):
    return dt.date(y, m, day)


def h(s, mod=89, off=10):
    return zlib.crc32(s.encode()) % mod + off


rows = []


def add(date, acct, desc, cp, cat, debit=0.0, credit=0.0, channel="FAST", ref=""):
    rows.append(dict(date=date, account=acct, desc=desc, cp=cp, cat=cat,
                     debit=round(debit, 2), credit=round(credit, 2), channel=channel, ref=ref))


def fit(items, target):
    """scale items so their 'amt' sums to target exactly"""
    k = target / sum(i["amt"] for i in items)
    for i in items:
        i["amt"] = round(i["amt"] * k, 2)
    items[-1]["amt"] = round(items[-1]["amt"] + target - sum(i["amt"] for i in items), 2)


SUPPLIERS = [("Bean Brothers Trading", "Coffee beans order", 0.34),
             ("Fresh Dairy Co-op", "Fresh milk & cream", 0.22),
             ("PackRight Packaging", "Cups, lids & takeaway boxes", 0.14),
             ("Sunrise Bakery Wholesale", "Bread & pastry supply", 0.20),
             ("Greenleaf Produce", "Fruit & vegetables", 0.10)]

for mi, (y, m, ndays) in enumerate(MONTHS):
    # ---------- inflows ----------
    fixed_in, card = [], []
    for day in range(1, ndays + 1):
        dd = d(y, m, day)
        wd = dd.weekday()
        base = {5: 2900, 6: 3100}.get(wd, 1750 if wd in (0, 1) else 2000)
        card.append(dict(date=dd, amt=base * random.uniform(0.85, 1.15)))
        if wd == 0:
            fixed_in.append(("GrabFood weekly payout", "Grab Singapore", "Revenue - Delivery", dd, round(random.uniform(1900, 2600), 2)))
            fixed_in.append(("foodpanda weekly payout", "foodpanda Singapore", "Revenue - Delivery", dd, round(random.uniform(1100, 1700), 2)))
    clients = [("Catering - Lumen Tech Pte Ltd", "Lumen Tech Pte Ltd", 3 + mi), ("Catering - Harbour Legal LLP", "Harbour Legal LLP", 9 + mi),
               ("Catering - Greenfield School", "Greenfield School", 17 + mi), ("Catering - Northbridge Studios", "Northbridge Studios", 24)]
    for desc, cp, day in clients[: 3 + (mi % 2)]:
        fixed_in.append((desc, cp, "Revenue - Catering", d(y, m, min(day, ndays)), round(random.uniform(3200, 5800), 2)))
    fit(card, IN_TARGET[mi] - sum(f[4] for f in fixed_in))
    for c in card:
        add(c["date"], CA, "POS card & QR settlement", "Stripe / NETS acquirer", "Revenue - POS Sales", credit=c["amt"], channel="NETS/CARD", ref=f"SETL{c['date']:%y%m%d}")
    for desc, cp, cat, dd, amt in fixed_in:
        add(dd, CA, desc, cp, cat, credit=amt, channel="FAST" if "Catering" in desc else "GIRO", ref=f"INV{dd:%y%m%d}{h(cp, 97, 0):02d}")

    # ---------- outflows ----------
    fixed_out = [
        (1, "Rent - Unit #02-14 Orchard Heritage Mall", "Orchard Heritage Mall Mgmt", "Rent", 11500.00, "GIRO"),
        (14, "CPF contributions", "CPF Board", "Payroll - CPF", [3650.00, 3700.00, 3720.00][mi], "GIRO"),
        (25, "Staff salaries (8 staff)", "Payroll batch", "Payroll - Salaries", [21500.00, 21500.00, 22000.00][mi], "GIRO"),
        ([10, 12, 11][mi], "Utilities - electricity & water", "SP Group", "Utilities", [2380.00, 2540.00, 2610.00][mi], "GIRO"),
        (8, "Fibre broadband & mobile", "Singtel", "Telecom", 188.50, "GIRO"),
        (5, "POS & inventory software subscription", "FoodTech POS Pte Ltd", "Software", 420.00, "CARD"),
        (3, "Business insurance premium", "SafeGuard Insurance", "Insurance", 650.00, "GIRO"),
        (20, "Monthly bookkeeping & accounting", "Tan & Partners LLP", "Professional Fees", 800.00, "FAST"),
        (18, "Social media advertising", "Meta Platforms Ireland", "Marketing", [1450.00, 1820.00, 1610.00][mi], "CARD"),
    ]
    oneoffs = []
    if mi == 1:
        oneoffs.append((16, "Espresso machine servicing", "BrewTech Services", "Repairs & Maintenance", 480.00, "FAST"))
    if mi == 2:
        oneoffs.append((9, "Commercial grinder purchase", "BrewTech Services", "Equipment", 1250.00, "FAST"))
        oneoffs.append((30, "GST payment (quarter ended 30 Sep)", "IRAS", "Tax - GST", 6800.00, "FAST"))
    for day, desc, cp, cat, amt, ch in fixed_out + oneoffs:
        add(d(y, m, day), CA, desc, cp, cat, debit=amt, channel=ch, ref=f"PAY{y % 100}{m:02d}{day:02d}{h(cp)}")
    supplier_target = OUT_TARGET[mi] - sum(x[4] for x in fixed_out + oneoffs)
    orders = []
    for day in range(1, ndays + 1):
        dd = d(y, m, day)
        if dd.weekday() in (1, 4):  # Tue & Fri orders
            for name, desc, wgt in SUPPLIERS:
                if name == "Bean Brothers Trading" or dd.weekday() == 1 or random.random() < 0.6:
                    orders.append(dict(date=dd, name=name, desc=desc, amt=wgt * random.uniform(700, 1100)))
    fit(orders, supplier_target)
    for o in orders:
        add(o["date"], CA, o["desc"], o["name"], "Suppliers - COGS", debit=o["amt"], channel="PAYNOW" if o["amt"] < 1000 else "FAST", ref=f"PO{o['date']:%y%m%d}{h(o['name'])}")
    add(d(y, m, ndays), SA, "Interest credit", "SMUtBank", "Interest Income", credit=15.00, channel="INTEREST", ref=f"INT{y % 100}{m:02d}")

# ---------- running balances ----------
rows.sort(key=lambda r: (r["date"], r["account"], r["credit"] == 0))
net = defaultdict(float)
for r in rows:
    net[r["account"]] += r["credit"] - r["debit"]
opening = {CA: round(CA_CLOSE - net[CA], 2), SA: round(SA_CLOSE - net[SA], 2)}
bal = dict(opening)
for i, r in enumerate(rows, 1):
    bal[r["account"]] = round(bal[r["account"]] + r["credit"] - r["debit"], 2)
    r["balance"] = bal[r["account"]]
    r["id"] = f"TXN-{i:04d}"
assert abs(bal[CA] - CA_CLOSE) < 0.01 and abs(bal[SA] - SA_CLOSE) < 0.01

for (y, m, _), ti, to in zip(MONTHS, IN_TARGET, OUT_TARGET):
    mi_ = sum(r["credit"] for r in rows if r["account"] == CA and r["date"].month == m)
    mo_ = sum(r["debit"] for r in rows if r["account"] == CA and r["date"].month == m)
    assert abs(mi_ - ti) < 0.01 and abs(mo_ - to) < 0.01, (m, mi_, mo_)

# ---------- accounts ----------
accounts = [
    dict(id=CA, name="Kopi & Co Business Current Account", type="CURRENT", currency="SGD", openingBalance=opening[CA], closingBalance=CA_CLOSE, role="OPERATING"),
    dict(id=SA, name="Kopi & Co Business Savings (Settlement)", type="SAVINGS", currency="SGD", openingBalance=opening[SA], closingBalance=SA_CLOSE, role="SETTLEMENT"),
]

# ---------- Excel ----------
wb = Workbook()
ws = wb.active
ws.title = "Transactions"
hdr = ["Date", "Account No.", "Account Name", "Description", "Counterparty", "Category", "Debit (SGD)", "Credit (SGD)", "Running Balance (SGD)", "Channel", "Reference"]
head_fill = PatternFill("solid", fgColor="0F3D3E")
head_font = Font(bold=True, color="FFFFFF")
ws.append(hdr)
for c in ws[1]:
    c.fill, c.font, c.alignment = head_fill, head_font, Alignment(horizontal="center", wrap_text=True)
names = {a["id"]: a["name"] for a in accounts}
for r in rows:
    ws.append([r["date"], r["account"], names[r["account"]], r["desc"], r["cp"], r["cat"], r["debit"] or None, r["credit"] or None, r["balance"], r["channel"], r["ref"]])
for row in ws.iter_rows(min_row=2):
    row[0].number_format = "dd-mmm-yyyy"
    for c in row[6:9]:
        c.number_format = "#,##0.00"
for i, w in enumerate([13, 14, 38, 42, 28, 24, 14, 14, 20, 12, 18], 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:K{len(rows) + 1}"
n = len(rows) + 1

sm = wb.create_sheet("Monthly Summary")
sm["A1"] = "Kopi & Co Pte Ltd (UEN 202312345K) - monthly cash flow by category"
sm["A1"].font = Font(bold=True, size=13)
sm.append([])
sm.append(["", "Aug-2026", "Sep-2026", "Oct-2026", "3-mth total", "Monthly avg"])
sm.append(["Month start", d(2026, 8, 1), d(2026, 9, 1), d(2026, 10, 1)])
sm.append(["Month end", d(2026, 8, 31), d(2026, 9, 30), d(2026, 10, 31)])
for c in sm[3]:
    c.fill, c.font = head_fill, head_font
for rr in (4, 5):
    for col in "BCD":
        sm[f"{col}{rr}"].number_format = "dd-mmm-yyyy"


def block(title, cats, amtcol, start):
    sm.cell(start, 1, title).font = Font(bold=True)
    r0 = start + 1
    for k, cat in enumerate(cats):
        r = r0 + k
        sm.cell(r, 1, cat)
        for col in "BCD":
            sm[f"{col}{r}"] = (f'=SUMIFS(Transactions!${amtcol}$2:${amtcol}${n},Transactions!$F$2:$F${n},$A{r},'
                               f'Transactions!$A$2:$A${n},">="&{col}$4,Transactions!$A$2:$A${n},"<="&{col}$5)')
        sm[f"E{r}"] = f"=SUM(B{r}:D{r})"
        sm[f"F{r}"] = f"=AVERAGE(B{r}:D{r})"
    rt = r0 + len(cats)
    sm.cell(rt, 1, "Total " + title.lower()).font = Font(bold=True)
    for col in "BCDEF":
        sm[f"{col}{rt}"] = f"=SUM({col}{r0}:{col}{rt - 1})"
        sm[f"{col}{rt}"].font = Font(bold=True)
    return rt


in_cats = ["Revenue - POS Sales", "Revenue - Delivery", "Revenue - Catering", "Interest Income"]
out_cats = ["Suppliers - COGS", "Rent", "Payroll - Salaries", "Payroll - CPF", "Utilities", "Telecom", "Software", "Insurance",
            "Professional Fees", "Marketing", "Repairs & Maintenance", "Equipment", "Tax - GST"]
rin = block("Inflows", in_cats, "H", 7)
rout = block("Outflows", out_cats, "G", rin + 2)
sm.cell(rout + 2, 1, "Net cash flow").font = Font(bold=True)
for col in "BCDEF":
    sm[f"{col}{rout + 2}"] = f"={col}{rin}-{col}{rout}"
sm.cell(rout + 4, 1, "Operating buffer = avg monthly outflow x months of cover").font = Font(bold=True)
sm.cell(rout + 5, 1, "Months of cover")
sm.cell(rout + 5, 2, 3)
sm.cell(rout + 6, 1, "Calculated buffer (SGD)")
sm.cell(rout + 6, 2, f"=F{rout}*B{rout + 5}")
for row in sm.iter_rows(min_row=6, max_row=rout + 6, min_col=2, max_col=6):
    for c in row:
        if c.number_format == "General":
            c.number_format = "#,##0.00"
sm[f"B{rout + 5}"].number_format = "0"
sm.column_dimensions["A"].width = 52
for col in "BCDEF":
    sm.column_dimensions[col].width = 16

ac = wb.create_sheet("Accounts")
ac.append(["Account No.", "Account Name", "Type", "Currency", "Role", "Opening 1-Aug-2026", "Closing 31-Oct-2026"])
for c in ac[1]:
    c.fill, c.font = head_fill, head_font
for a in accounts:
    ac.append([a["id"], a["name"], a["type"], a["currency"], a["role"], a["openingBalance"], a["closingBalance"]])
ac.append(["", "", "", "", "Total", "=SUM(F2:F3)", "=SUM(G2:G3)"])
for row in ac.iter_rows(min_row=2, min_col=6, max_col=7):
    for c in row:
        c.number_format = "#,##0.00"
for i, w in enumerate([14, 44, 10, 10, 12, 20, 20], 1):
    ac.column_dimensions[get_column_letter(i)].width = w

cm = wb.create_sheet("Example Commitments")
cm.append(["Description", "Category", "Direction", "Amount (SGD)", "Due date", "Status", "Note"])
for c in cm[1]:
    c.fill, c.font = head_fill, head_font
for row in [("GST payment (quarter ended 31 Dec)", "Tax - GST", "OUTFLOW", 7200, d(2027, 1, 29), "PENDING", "Due within 90 days, so it reduces surplus. Use in the demo"),
            ("Kitchen renovation - 2nd instalment", "Equipment", "OUTFLOW", 18000, d(2027, 1, 15), "PENDING", "Optional"),
            ("Catering deposit - Lumen Tech annual event", "Revenue - Catering", "INFLOW", 6000, d(2026, 12, 5), "PENDING", "Optional")]:
    cm.append(list(row))
for row in cm.iter_rows(min_row=2):
    row[3].number_format = "#,##0.00"
    row[4].number_format = "dd-mmm-yyyy"
for i, w in enumerate([44, 22, 12, 16, 14, 10, 52], 1):
    cm.column_dimensions[get_column_letter(i)].width = w
cm.append([])
cm.append(["NOTE: demo starts with ZERO pending commitments (investable surplus = S$240,000). These rows are examples only."])

wb.save(ROOT / "data/KopiCo_Transactions_Aug-Oct2026.xlsx")
print(f"{len(rows)} transactions | opening CA {opening[CA]:,.2f} SA {opening[SA]:,.2f} | closing total {CA_CLOSE + SA_CLOSE:,.2f}")
