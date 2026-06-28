// Bundled motivational quotes for the dashboard's "Field Note" panel.
//
// WHY local, not an API: the locked tech stack adds no external services for
// this, and a daily quote must work offline and never rate-limit. A curated set
// is shipped in the bundle and rotated deterministically by date (see
// core/utils/dailyQuote.ts) so the same day always shows the same note and no
// quote repeats until the whole set has been seen.
//
// Shape is a tuple [text, author] to keep the list compact and easy to extend —
// add more entries freely; the selector adapts to the length automatically.

export type Quote = readonly [text: string, author: string]

export const QUOTES: readonly Quote[] = [
  ['The journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['Discipline is choosing between what you want now and what you want most.', 'Augusta F. Kantra'],
  ['Little by little, one travels far.', 'J.R.R. Tolkien'],
  ['What you do today can improve all your tomorrows.', 'Ralph Marston'],
  ['A goal without a plan is just a wish.', 'Antoine de Saint-Exupéry'],
  ['Well begun is half done.', 'Aristotle'],
  ['The future depends on what you do today.', 'Mahatma Gandhi'],
  ['Don’t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['Great things are done by a series of small things brought together.', 'Vincent van Gogh'],
  ['You don’t have to be great to start, but you have to start to be great.', 'Zig Ziglar'],
  ['Success is the sum of small efforts repeated day in and day out.', 'Robert Collier'],
  ['The best way out is always through.', 'Robert Frost'],
  ['Fall seven times, stand up eight.', 'Japanese Proverb'],
  ['Quality is not an act, it is a habit.', 'Aristotle'],
  ['We are what we repeatedly do.', 'Will Durant'],
  ['Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'],
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['Believe you can and you’re halfway there.', 'Theodore Roosevelt'],
  ['Action is the foundational key to all success.', 'Pablo Picasso'],
  ['Setting goals is the first step in turning the invisible into the visible.', 'Tony Robbins'],
  ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
  ['The harder you work for something, the greater you’ll feel when you achieve it.', 'Anonymous'],
  ['Dreams don’t work unless you do.', 'John C. Maxwell'],
  ['Your future is created by what you do today, not tomorrow.', 'Robert Kiyosaki'],
  ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
  ['Perseverance is not a long race; it is many short races one after another.', 'Walter Elliot'],
  ['A river cuts through rock not because of its power but its persistence.', 'James N. Watkins'],
  ['Motivation gets you going, but discipline keeps you growing.', 'John C. Maxwell'],
  ['Small deeds done are better than great deeds planned.', 'Peter Marshall'],
  ['Do the hard jobs first. The easy jobs will take care of themselves.', 'Dale Carnegie'],
  ['The expert in anything was once a beginner.', 'Helen Hayes'],
  ['Courage doesn’t always roar. Sometimes it’s the quiet voice saying “try again tomorrow.”', 'Mary Anne Radmacher'],
  ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
  ['If you’re going through hell, keep going.', 'Winston Churchill'],
  ['The way to get started is to quit talking and begin doing.', 'Walt Disney'],
  ['Either you run the day or the day runs you.', 'Jim Rohn'],
  ['Today’s accomplishments were yesterday’s impossibilities.', 'Robert H. Schuller'],
  ['Hardships often prepare ordinary people for an extraordinary destiny.', 'C.S. Lewis'],
  ['Don’t count the days, make the days count.', 'Muhammad Ali'],
  ['What we fear of doing most is usually what we most need to do.', 'Ralph Waldo Emerson'],
  ['The man who moves a mountain begins by carrying away small stones.', 'Confucius'],
  ['Be not afraid of going slowly, be afraid only of standing still.', 'Chinese Proverb'],
  ['You are never too old to set another goal or to dream a new dream.', 'C.S. Lewis'],
  ['Opportunities don’t happen. You create them.', 'Chris Grosser'],
  ['Done is better than perfect.', 'Sheryl Sandberg'],
  ['The mind is everything. What you think you become.', 'Buddha'],
  ['Inch by inch, life’s a cinch. Yard by yard, life’s hard.', 'Anonymous'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
  ['Patience and perseverance have a magical effect.', 'John Quincy Adams'],
  ['Strength does not come from winning. Your struggles develop your strengths.', 'Arnold Schwarzenegger'],
  ['Continuous improvement is better than delayed perfection.', 'Mark Twain'],
  ['The only limit to our realization of tomorrow is our doubts of today.', 'Franklin D. Roosevelt'],
  ['What gets measured gets managed.', 'Peter Drucker'],
  ['Discipline equals freedom.', 'Jocko Willink'],
  ['Things may come to those who wait, but only the things left by those who hustle.', 'Abraham Lincoln'],
  ['One day or day one. You decide.', 'Anonymous'],
  ['The future belongs to those who prepare for it today.', 'Malcolm X'],
  ['A year from now you may wish you had started today.', 'Karen Lamb'],
  ['Slow is smooth, and smooth is fast.', 'Navy SEAL Proverb'],
  ['Climb the mountain so you can see the world, not so the world can see you.', 'David McCullough Jr.'],
  ['Persistence guarantees that results are inevitable.', 'Paramahansa Yogananda'],
  ['Begin anywhere.', 'John Cage'],
]
