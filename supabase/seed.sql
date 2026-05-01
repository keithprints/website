-- ============================================================
-- Keith Prints — Seed data
-- Run AFTER 001_init.sql in Supabase SQL Editor
-- ============================================================
-- Note: image_url values are placeholders. Upload real images to
-- Supabase Storage (or any image host) and update via Table Editor.

insert into public.products
  (name, slug, description, category, image_url, colors, customizable, customization_label, sale_price_cents, unit_cost_cents, print_time_hours, featured, badge, display_order)
values
  -- KEYCHAINS
  ('Wolf Head', 'wolf-head', 'Low-poly wolf, looks legit on any backpack.', 'keychains', null, '{Blue,Red,Black,Glow}', false, null, 800, 85, 2.5, true, 'hot', 1),
  ('Pixel Sword', 'pixel-sword', 'Diamond sword from you-know-where. Glows-in-the-dark.', 'keychains', null, '{Blue,Glow}', false, null, 700, 70, 1.5, true, 'fav', 2),
  ('Lil Octopus', 'lil-octopus', 'Smiley purple octopus that you can squish a little.', 'keychains', null, '{Purple,Pink,Blue}', false, null, 600, 60, 2.0, false, null, 3),
  ('Level Up', 'level-up', 'Pixel art tag for the gamer in your life.', 'keychains', null, '{Black,Blue,Red}', false, null, 500, 45, 1.0, false, 'new', 4),
  ('Dragon Egg', 'dragon-egg', 'Cracked dragon egg with the lil dragon peeking out.', 'keychains', null, '{Blue,Green,Purple}', false, null, 800, 90, 3.0, false, null, 5),
  ('Skull', 'skull', 'Glow-in-the-dark skull. Goes hard at Halloween.', 'keychains', null, '{White,Glow,Black}', false, null, 600, 55, 1.5, false, null, 6),
  ('Heart Tag', 'heart-tag', 'Customizable heart with up to 8 letters carved in.', 'keychains', null, '{Red,Pink,Purple,White}', true, 'Engrave a name (max 8 chars)', 500, 50, 1.0, false, null, 7),
  ('Ghost Buddy', 'ghost-buddy', 'Cute ghost. Friendly. Will not haunt you. Probably.', 'keychains', null, '{White,Glow}', false, null, 600, 55, 1.5, false, null, 8),

  -- FIDGETS
  ('Infinity Cube', 'infinity-cube', 'Folds and flips forever. Unfolds in 8 directions.', 'fidgets', null, '{Black,Blue,Green,Purple}', false, null, 1200, 240, 6.0, true, 'hot', 1),
  ('Tri-Spinner', 'tri-spinner', 'Smooth bearing spinner. Spins for 90+ seconds.', 'fidgets', null, '{Black,Blue,Red,Green}', false, null, 1000, 200, 4.5, false, null, 2),
  ('Spike Cube', 'spike-cube', 'Soft squishy-feeling spikes. Weirdly satisfying.', 'fidgets', null, '{Blue,Purple,Red}', false, null, 900, 180, 3.5, false, null, 3),
  ('Snap Snake', 'snap-snake', '24 articulated joints. Coil it, twist it, slither it.', 'fidgets', null, '{Green,Black,Rainbow}', false, null, 1400, 280, 7.0, true, 'fav', 4),
  ('Gear Ring', 'gear-ring', 'Spinning gears inside a ring. Pure mechanical joy.', 'fidgets', null, '{Black,Silver,Gold}', false, null, 1100, 220, 5.0, false, null, 5),
  ('Pop Slider', 'pop-slider', 'Pocket-sized slider with a satisfying click.', 'fidgets', null, '{Blue,Pink,Black}', false, null, 800, 160, 3.0, false, 'new', 6),

  -- FIGURINES
  ('Baby Blue Dragon', 'baby-blue-dragon', 'Hand-painted scales, cute lil teef. About 4" tall.', 'figurines', null, '{Blue}', false, null, 1800, 310, 8.0, true, 'hot', 1),
  ('Forest Dragon', 'forest-dragon', 'Mossy green dragon with tiny wings. So sweet.', 'figurines', null, '{Green}', false, null, 1800, 310, 8.0, false, null, 2),
  ('Astro Buddy', 'astro-buddy', 'Waving astronaut. Comes with a tiny rocket pal.', 'figurines', null, '{White}', false, null, 1500, 250, 6.5, true, 'fav', 3),
  ('Moon Cat', 'moon-cat', 'Sleek black cat with a glow-in-the-dark moon mark.', 'figurines', null, '{Black}', false, null, 1400, 230, 6.0, false, null, 4),
  ('Axolotl', 'axolotl', 'Pink axolotl, looks chill, judges your homework.', 'figurines', null, '{Pink,Blue,White}', false, null, 1300, 220, 5.5, false, 'new', 5),
  ('Tiny T-Rex', 'tiny-trex', 'Articulated jaw, tiny arms, big attitude.', 'figurines', null, '{Green,Brown,Black}', false, null, 1600, 270, 7.0, false, null, 6),
  ('Capybara', 'capybara', 'The most chill animal in figurine form. Goated.', 'figurines', null, '{Brown,Tan}', false, null, 1400, 230, 6.0, false, null, 7),

  -- ORNAMENTS
  ('Crystal Drop', 'crystal-drop', 'Faceted crystal that catches the light. Hangable.', 'ornaments', null, '{Clear,Blue,Pink,Purple}', false, null, 800, 80, 2.0, false, null, 1),
  ('Snowflake', 'snowflake', 'No two are the same. Pick your pattern at checkout.', 'ornaments', null, '{White,Blue,Silver}', true, 'Pick a pattern (1-6)', 700, 70, 2.5, false, null, 2),
  ('Lucky Star', 'lucky-star', '5-point star ornament. Looks great in a window.', 'ornaments', null, '{Gold,Silver,White}', false, null, 600, 60, 1.5, false, 'new', 3),
  ('Mini Pumpkin', 'mini-pumpkin', 'Hollow mini pumpkin. Drops a tea light inside.', 'ornaments', null, '{Orange,White,Black}', false, null, 700, 70, 2.5, false, null, 4),

  -- MORE
  ('Phone Stand', 'phone-stand', 'Holds your phone for videos. Folds flat. Multi-angle.', 'more', null, '{Black,Blue,White}', false, null, 1500, 200, 4.0, true, 'hot', 1),
  ('Pencil Holder', 'pencil-holder', 'Honeycomb pencil holder. Holds 30+ pencils.', 'more', null, '{Black,White,Yellow}', false, null, 1200, 180, 4.5, false, null, 2),
  ('Soccer Stress Ball', 'soccer-ball', 'Hollow soccer ball. Squishes a tiny bit. Decor or toy.', 'more', null, '{Black,Rainbow}', false, null, 1000, 150, 3.5, false, null, 3),
  ('Custom Name Tag', 'custom-name-tag', 'Your name, your color, your font. Up to 12 letters.', 'more', null, '{Blue,Red,Black,White,Green,Purple}', true, 'Your name (max 12 chars)', 500, 50, 1.0, false, 'fav', 4),
  ('Mini Chess Piece', 'mini-chess', 'Detailed chess pieces. Collect the whole set.', 'more', null, '{White,Black}', false, null, 400, 35, 0.75, false, null, 5);
