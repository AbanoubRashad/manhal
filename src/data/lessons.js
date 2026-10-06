// Lesson notes for the sample courses, in lesson order. Nour, the AI mentor, answers from
// this text (plus transcripts, files and approved Q&A answers that instructors add later).
// Plain data with no imports, shared by the server seed and the browser demo.

export const lessonNotes = {
  'python-for-data-analysis': [
    `Jupyter notebooks let you write Python in small cells and see each result right below it, which makes them ideal for exploring data. Install Anaconda or run "pip install notebook", then start it with "jupyter notebook" and create a new Python 3 notebook.

Run a cell with Shift+Enter. Cells share the same memory, so a variable defined in one cell is available in the next. For example, type x = 5 in one cell and x * 2 in the next. If results look strange, use Kernel > Restart & Run All to rerun everything from the top in order.`,
    `Python has a few core data types. Integers (int) are whole numbers like 42, floats are decimals like 3.14, strings (str) are text in quotes like "Cairo", and booleans (bool) are True or False.

A variable is a name that points to a value: price = 120. Python works out the type for you, and type(price) shows it. You can convert between types with int(), float() and str(). For example, int("7") + 3 gives 10, while "7" + "3" gives "73" because adding strings joins them.`,
    `A for loop repeats code for each item in a sequence. For example, for city in ["Cairo", "Giza", "Alexandria"]: print(city) prints each city on its own line. range(5) gives the numbers 0 to 4, which is handy for counting.

A function packages code you want to reuse. Define it with def, give it parameters, and return a result: def add_vat(price, rate=0.14): return price * (1 + rate). Calling add_vat(100) returns 114.0. Keep functions small and give them clear names, so your notebook reads like a story.`,
    `pandas is the main Python library for working with tables. A DataFrame is a table with labelled rows and columns, and each column is a Series. Import it with import pandas as pd.

Load a CSV file with df = pd.read_csv("sales.csv"). Then explore it: df.head() shows the first five rows, df.shape gives the number of rows and columns, df.info() lists each column's type and how many values are missing, and df.describe() summarises the numeric columns. Select one column with df["price"] and several with df[["product", "price"]].`,
    `Real data is messy, so cleaning comes before analysis. Start by finding missing values with df.isna().sum().

You have two main choices. dropna() removes rows with missing values, which is safe when only a few rows are affected. fillna() replaces missing values instead, for example df["city"].fillna("Unknown") or filling a numeric column with its median. Also remove exact duplicates with drop_duplicates(), fix types with astype() or pd.to_datetime(), and tidy text with str.strip() and str.lower() so "Cairo " and "cairo" count as the same city.`,
    `groupby splits a table into groups, applies a calculation to each group, and combines the results. For example, df.groupby("city")["revenue"].sum() gives total revenue per city.

Use agg() for several calculations at once: df.groupby("city").agg(orders=("order_id", "count"), revenue=("revenue", "sum")). Add sort_values("revenue", ascending=False) to rank the groups. To compare two dimensions, a pivot table helps: df.pivot_table(index="city", columns="month", values="revenue", aggfunc="sum").`,
    `matplotlib draws charts in Python. Import it with import matplotlib.pyplot as plt. A line chart shows change over time: plt.plot(months, revenue). A bar chart compares categories: plt.bar(cities, revenue).

Always label your chart: plt.title(), plt.xlabel() and plt.ylabel(), then plt.show(). pandas can plot directly too, for example df.groupby("city")["revenue"].sum().plot(kind="bar"). Keep charts simple: one message per chart.`,
    `Choose the chart for the question you are answering. A bar chart is best for comparing values across categories, such as revenue per city. A line chart shows a trend over time. A scatter plot shows the relationship between two numbers, such as ad spend and sales. A histogram shows how values are spread out.

Avoid pie charts with many slices, because people struggle to compare angles; with more than three or four slices, use a sorted bar chart instead. For example, a sorted horizontal bar chart of 12 product categories is far easier to read than a 12-slice pie.`,
    `A chart in a report should be readable in five seconds. Write a title that states the finding, like "Giza drove most of the growth in Q3", rather than just "Revenue".

Remove clutter: light gridlines or none, no 3D effects, and no unnecessary borders. Use one highlight colour for the point you want people to notice and grey for everything else. Start bar charts at zero so bar lengths are honest. Label values directly on the bars when there are only a few, so readers don't need to look across to an axis.`,
    `In this project you analyse a year of shop sales. Load the file, check df.info() and clean missing values and wrong types first.

Then answer business questions one at a time: total revenue per month (group by month and sum), the top ten products by revenue, and the average order value (total revenue divided by the number of orders). Turn each answer into one clear chart. For example, a line chart of monthly revenue might show a dip in August that you then explain by looking at which products sold less that month.`,
    `Numbers convince people when they are part of a story. A simple structure works well: the context (what we wanted to know), the finding (what the data shows) and the recommendation (what we should do about it).

Lead with the most important insight, not with your method. Support each claim with one chart and one sentence that explains it. Be honest about limits, such as missing months or a small sample. For example: "Repeat customers bring in 60% of revenue, so a loyalty offer is likely to pay off; we only have six months of data, so we should check again in Q2."`,
    `The capstone brings everything together. You pick a market, collect or download a dataset, clean it, analyse it with pandas and present your findings in a short report with three to five charts.

Your report should state the question, describe the data and how you cleaned it, show your key findings with clear charts, and end with recommendations. Share the notebook as well as the report so others can check your work. Reviewers look for clean code, honest charts and conclusions that follow from the data.`,
  ],

  'sql-for-analysts': [
    `SELECT chooses the columns you want and FROM names the table. For example, SELECT name, city FROM customers returns two columns for every customer. SELECT * returns every column, which is fine for exploring but slow and unclear in real reports.

WHERE filters rows before they are returned: SELECT name FROM customers WHERE city = 'Cairo'. Combine conditions with AND and OR, and use parentheses to make the order clear. IN matches a list (city IN ('Cairo', 'Giza')), BETWEEN matches a range, and LIKE matches patterns, where % stands for any characters.`,
    `ORDER BY sorts the result. ORDER BY revenue DESC puts the highest revenue first, and ASC (the default) sorts from smallest to largest. You can sort by more than one column, for example ORDER BY city, revenue DESC.

LIMIT returns only the first rows, which is perfect for top-N questions: SELECT product, revenue FROM sales ORDER BY revenue DESC LIMIT 10 gives the ten best-selling products. Without ORDER BY, the database can return rows in any order, so always sort before you limit.`,
    `NULL means a value is missing or unknown. It isn't zero and it isn't an empty string. Because of that, comparisons with NULL never return true: WHERE phone = NULL finds nothing. Use WHERE phone IS NULL or IS NOT NULL instead.

COALESCE returns its first non-null argument, so COALESCE(discount, 0) treats a missing discount as zero. Watch out in aggregates: COUNT(*) counts all rows, but COUNT(phone) counts only rows where phone isn't NULL. AVG and SUM also ignore NULLs.`,
    `A join combines rows from two tables using a matching column, usually an id. An INNER JOIN returns only rows that have a match in both tables. For example, SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id lists each order with its customer's name.

A LEFT JOIN keeps every row from the left table, and fills the right table's columns with NULL when there is no match. Use it to find things that are missing, such as customers who never ordered: LEFT JOIN orders and keep rows WHERE o.id IS NULL. Always check that your ON condition is right; a wrong one multiplies rows.`,
    `UNION stacks the results of two queries on top of each other. Both queries must return the same number of columns, with compatible types, in the same order.

UNION removes duplicate rows, while UNION ALL keeps them. UNION ALL is faster and is usually what you want when the two sets can't overlap. For example, combine this year's and last year's order tables with SELECT id, total FROM orders_2025 UNION ALL SELECT id, total FROM orders_2026.`,
    `A subquery is a query inside another query. In WHERE, it can filter against a list: SELECT name FROM customers WHERE id IN (SELECT customer_id FROM orders WHERE total > 1000) finds customers with a big order.

A subquery in FROM acts as a temporary table that you can query again. For readability, many analysts write these as a CTE with WITH: WITH big AS (SELECT customer_id FROM orders WHERE total > 1000) SELECT COUNT(DISTINCT customer_id) FROM big. CTEs let you build a long query in small, named steps.`,
    `GROUP BY collapses rows into groups so you can summarise them with aggregate functions such as COUNT, SUM, AVG, MIN and MAX. For example, SELECT city, SUM(total) FROM orders GROUP BY city gives revenue per city. Every selected column must either be in GROUP BY or inside an aggregate.

WHERE filters rows before grouping, and HAVING filters groups after aggregation. So to keep only cities with more than 100 orders, write GROUP BY city HAVING COUNT(*) > 100. You can't use HAVING's job in WHERE, because the counts don't exist until the rows are grouped.`,
    `Window functions calculate across related rows without collapsing them, so each row keeps its detail. The OVER clause defines the window: PARTITION BY splits rows into groups and ORDER BY sets the order inside each group.

For example, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) numbers each customer's orders, so number 1 is their first order. SUM(total) OVER (ORDER BY day) gives a running total, and LAG(total) OVER (ORDER BY day) brings in the previous day's value so you can calculate day-over-day change.`,
    `Dates need care. Store them in a real date or timestamp type, not as text, so sorting and comparisons work. Most databases let you extract parts: in PostgreSQL, EXTRACT(MONTH FROM created_at) or DATE_TRUNC('month', created_at), which is ideal for grouping by month.

Filter with ranges rather than functions on the column, so indexes can help: WHERE created_at >= '2026-01-01' AND created_at < '2026-02-01' covers January exactly. Be careful with time zones: an order placed at 1 a.m. in Cairo may fall on the previous day in UTC.`,
    `A cohort groups users by when they started, for example the month of their first order. Cohort analysis then asks how each group behaves over time, such as what share of January's new customers ordered again in February, March and April.

Build it in steps: find each customer's first order month with MIN(created_at) in a CTE, join it back to all orders, calculate the months between the first order and each later order, then count distinct customers per cohort and month. The result is a retention table that shows whether newer cohorts stick around better than older ones.`,
    `A KPI query turns raw tables into the few numbers a team watches every week. Start by defining each KPI precisely in words: for example, "average order value is total revenue from paid orders divided by the number of paid orders in that week".

Then write one CTE per building block (paid orders, revenue, order count) and combine them in a final SELECT. Name columns clearly, round only at the end, and test the query against a week you can check by hand. Keep the definitions in a comment at the top so everyone calculates the KPI the same way.`,
    `The capstone is an e-commerce report for a fictional online shop. You will answer: monthly revenue and order count, the top products, average order value, repeat purchase rate, and how many customers come back after their first month.

Each answer should be one query, written with clear CTEs and comments. Present the results in a short summary with a table or chart for each question and one sentence explaining what it means for the business. Reviewers check correct joins, correct use of WHERE versus HAVING, and careful handling of NULLs and dates.`,
  ],

  'ui-ux-design-from-sketch-to-prototype': [
    `Good design starts with people, not screens. Before sketching anything, describe who you are designing for: their goals, the situation they are in and what frustrates them today.

A simple way to capture this is a proto-persona: a short profile based on what you know, which you then check with research. For example, "Mona, 29, orders lunch at work on her phone and needs to finish in under two minutes." Write down your assumptions too, so you know what to test.`,
    `User interviews help you understand behaviour and motivation. Talk to five to eight people from your target group, one at a time, for about thirty minutes.

Ask about past behaviour rather than opinions about the future: "Tell me about the last time you ordered food online" works better than "Would you use an app that…?". Ask open questions, follow up with "why?", and stay quiet so people keep talking. Avoid leading questions, and take notes or record with permission.`,
    `After interviews, turn raw notes into insights. Write each observation on its own sticky note, then group related notes on a wall or a digital board. This is called affinity mapping.

Name each group with an insight that explains it, for example "People reorder the same meal because browsing takes too long." Turn the strongest insights into "How might we" questions, such as "How might we help people reorder a favourite meal in one tap?". These questions guide your design ideas.`,
    `Information architecture is how content is organised and labelled so people can find it. It covers navigation, categories and the names you give them.

Card sorting helps: ask users to group cards with your content items and name the groups. Use the words your users use, not internal company terms. A sitemap then shows every screen and how they connect. For example, a food delivery app might have Home, Search, Restaurant, Cart and Orders at the top level.`,
    `A user flow describes the steps a user takes to finish a task, from the entry point to the goal. Draw it as boxes for screens and arrows for actions, with diamonds for decisions.

For example, the flow for reordering a meal might be: open app, tap Orders, choose a past order, tap Reorder, confirm the address, pay, see confirmation. Mapping the flow shows unnecessary steps and dead ends early, before anyone designs a single screen.`,
    `Low-fidelity wireframes show layout and structure, not visual style. Use grey boxes, simple lines and placeholder text, on paper or in a tool like Figma.

Because wireframes are quick and cheap, you can explore several layouts and throw away the weak ones. Focus on what goes on each screen, its priority and its position. Leave colours, fonts and images for later, so feedback stays on structure rather than taste.`,
    `A layout grid keeps screens consistent and easy to scan. On mobile, a 4-column grid with 16px margins is common; on desktop, a 12-column grid gives you flexible layouts.

Use a spacing scale, for example multiples of 8px, so gaps feel deliberate. Group related items closer together and separate unrelated ones with more space. Align elements to the grid so edges line up, which makes a screen feel calm and organised.`,
    `Interface type should be easy to read first. Use one or two typefaces, a clear size hierarchy (for example 32px headings, 20px subheadings and 16px body text) and a comfortable line height.

Colour should support meaning. Pick a primary colour for main actions, neutrals for text and backgrounds, and specific colours for success, warning and error states. Check contrast: normal text needs a contrast ratio of at least 4.5:1 against its background to meet WCAG AA, so everyone can read it.`,
    `A component library is a set of reusable building blocks such as buttons, inputs, cards and navigation bars. In Figma, you create a component once and use instances of it everywhere.

Variants let one component cover its different states, for example a button that is primary or secondary, and default, hover or disabled. When you update the main component, every instance updates too, which keeps designs consistent and saves time. Name components clearly so developers can match them to code.`,
    `An interactive prototype links screens so people can click through a flow as if it were the real product. In Figma, you connect frames with interactions such as "on tap, navigate to".

Prototype only the flows you want to test, not the whole app. Add realistic content, because placeholder text hides real problems. For example, test the reorder flow with real dish names and prices. Smart animate and overlays can make the prototype feel real, but clarity matters more than polish.`,
    `Usability testing means watching real target users try to complete tasks with your design. Five users usually reveal most of the major problems.

Give each person a realistic task, such as "Reorder the meal you had last Friday", then observe without helping. Ask them to think aloud. Note where they hesitate, make mistakes or give up. Afterwards, list the problems, rate how severe each one is, and fix the most serious ones first before testing again.`,
    `In the capstone you design a food delivery app from research to tested prototype. You will define your user, run three to five interviews, map insights, and design the main flows: browse, order, reorder and track.

Deliver wireframes, a small component library, high-fidelity screens and a clickable prototype. Then run a usability test with at least three people and show what you changed because of it. Reviewers look for clear reasoning that links research to design decisions.`,
  ],

  'digital-marketing-essentials': [
    `The marketing funnel describes the stages people go through before buying. The top of the funnel is awareness: people discover that you exist. The middle is consideration: they compare options and learn whether you can solve their problem. The bottom is conversion: they buy.

After the purchase comes retention, where happy customers buy again and recommend you. Each stage needs different content and different measures. For example, a short video can build awareness, while a clear pricing page and reviews help at the bottom of the funnel.`,
    `Marketing works best when you know exactly who you are talking to. Describe your ideal customer: their needs, the problems they want solved, where they spend time online and what stops them from buying.

Talk to real customers and read their reviews and questions; the words they use make the best copy. For example, if customers say "I don't have time to cook", your message should talk about saving time rather than about recipes.`,
    `A good marketing goal is specific and measurable. "Get more customers" is vague; "Get 200 newsletter sign-ups by the end of March" is clear, because you know what to measure and when.

The SMART checklist helps: Specific, Measurable, Achievable, Relevant and Time-bound. Link each goal to a funnel stage and to one main metric, so you can tell whether your work is paying off.`,
    `Search engine optimisation (SEO) helps your pages appear in search results without paying for ads. It starts with keyword research: finding the words people actually type, such as "cheap laptop Cairo".

On each page, use the main keyword in the title, the first paragraph and a descriptive URL, and write a clear meta description. Most importantly, answer the searcher's question better than other pages. Technical basics matter too: fast loading, a mobile-friendly layout and links between your own pages.`,
    `Email marketing lets you talk directly to people who asked to hear from you. Build your list with a clear offer, such as a useful guide, and always get permission.

Segment your list so people get relevant messages, for example new subscribers versus repeat customers. Write a clear subject line, keep one main call to action per email, and make unsubscribing easy. Measure open rate, click rate and, most of all, conversions.`,
    `Content people share is useful, emotional or easy to pass on. Practical guides, honest stories and short checklists tend to travel further than adverts.

Shape each piece for its platform: a short vertical video for TikTok or Reels, a carousel for Instagram, and a longer article for search. For example, "5 mistakes to avoid when buying a used car" is easy to understand and easy to share. Always end with a next step for the reader.`,
    `Online ads, such as Google and Meta ads, are sold through auctions. When someone searches or scrolls, the platform runs an auction among advertisers who target that person.

The winner isn't simply the highest bid. Platforms also consider ad quality and relevance, so a relevant ad with a lower bid can beat a poor ad with a higher bid. That is why clear, relevant ads and good landing pages can lower your cost per click.`,
    `Set a daily or total budget so you never spend more than planned. Then choose a bidding strategy: manual bidding gives you control over each bid, while automated strategies such as "maximise conversions" let the platform adjust bids for you.

Start small, test two or three ad variations, and move budget towards what works. Judge ads by cost per result (for example, cost per sign-up), not by clicks alone.`,
    `A landing page is the page people reach after clicking an ad. It should have one goal and one clear call to action, such as "Book a free trial".

Keep the headline consistent with the ad, explain the benefit quickly, and add proof such as reviews or numbers. Remove distractions like the full site menu. The page must load fast on mobile. Test one change at a time, for example a new headline, to see what improves the conversion rate.`,
    `Analytics tools such as Google Analytics show how people find and use your site. Key ideas: users are people, sessions are visits, and a conversion is a completed goal like a purchase or sign-up.

Use UTM parameters on your links to see which campaign brought each visitor, for example utm_source=instagram. Set up conversions for the actions that matter to your business, so you measure results rather than just traffic.`,
    `Numbers only help if you read them in context. Compare against a baseline, such as last month, rather than looking at one number on its own.

Look at rates as well as totals: conversion rate is conversions divided by visitors. For example, 50 sales from 2,000 visitors is a 2.5% conversion rate. If traffic doubles but sales stay flat, the new visitors probably aren't the right audience. Decide what you will change based on the numbers, then check again.`,
    `In the capstone you write a 30-day marketing plan for a small business. Define the customer and one SMART goal, choose two or three channels that fit, and plan content and a small ad test week by week.

Set up measurement before you start, decide which numbers you will review each week, and describe what you will do if the results are poor. Keep the plan realistic for the time and budget you actually have.`,
  ],
};
