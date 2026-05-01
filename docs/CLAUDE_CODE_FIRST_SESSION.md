# Claude Code — First Session Prompt

When you open this project in Claude Code for the first time, paste this as your opening message. It bootstraps Claude with the right context.

---

I'm picking up the Keith Prints project. Read these files first, in order, before doing anything else:

1. `CLAUDE.md` — full project context and decisions
2. `README.md` — quickstart
3. `docs/SETUP.md` — external services walkthrough
4. `docs/ARCHITECTURE.md` — deep dive on the stack

Once you've read those, I want to deploy this to Vercel this afternoon. My current state:

- [ ] I have / I need a Supabase account
- [ ] I have / I need a Stripe account
- [ ] I have / I need a Vercel account
- [ ] I have / I need a GitHub repo for this code

Tell me the next 3 concrete steps to get to a working deployment. Don't write any code until I confirm — at this stage I need help with external service setup, not refactoring.

After we're deployed and working, the things I want to tackle next (in priority order):

1. Upload real product photos to replace the emoji placeholders
2. Test the full checkout flow with a real Stripe test card
3. Set up Mom and Keith with Supabase logins so they can edit products
4. Customize the seed product list to match what Keith actually offers right now

---

## Things to ask Claude Code if you get stuck

- "I'm getting [error] when I run the SQL migration. What's wrong?"
- "Vercel deployed but the products aren't showing. Help me debug."
- "I want to add a new product attribute called [X]. Walk me through the schema change."
- "How do I switch from Stripe test mode to live mode safely?"
- "Add an admin-only page that shows the bestsellers view"

## Things NOT to ask Claude Code

These were already discussed and decided. Re-opening them wastes time:

- "Should we use React/Next.js?" — No, vanilla JS is intentional
- "Should we add a cart?" — No, single-item checkout is intentional
- "Should we track inventory?" — No, print-to-order
- "Should we use Airtable instead of Supabase?" — No, decision made
- "Should we use Big Cartel/Shopify/Etsy instead?" — No, custom stack chosen

If you genuinely need to revisit one of those, mention what changed about the requirements. Otherwise the answer was already worked out.
