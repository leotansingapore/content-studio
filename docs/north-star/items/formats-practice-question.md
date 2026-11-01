# A practice question post

`formats-practice-question` | formats | phase 3 | status: missing | /north-star#formats-practice-question

## Leo asked

No direct ask. From the weekly Starter Story research Leo set on 1 Nov 2026 ("reverse engineer how the apps do their marketing, improve the capabilities of our app.postmosis"). Jev (jev-1.13.0) scored it 0.64 on whether it would help a solo professional win clients from their posts within 60 days, with 0.32 overlap with what Write already does.

## How the best do it

- Excel Exercises (Starter Story, youtu.be/pwvnH9S4j60) teaches Excel by making people answer. Type a SUMIF criterion without quotes and a hint says to add them; get it right and you score points and move on (10:35). Its daily challenge has a worldwide leaderboard, and its founder says that hands-on repetition is how people learn (checked 1 Nov 2026).
- CMFAS Prep's homepage opens on one exam question with four answers, then explains the sign error most people make (checked 1 Nov 2026).
- None of the competitors in src/data/northStarCompetitors.ts has a question-and-answer post format.

## What we have today

- Write makes four formats: Carousel, Short video, Text post and Story frames (FORMATS in src/pages/GeneratePage.tsx). Idea sources include Myth-busting and "3 things you didn't know".
- The carousel library tags saved carousels with a Quiz format (src/lib/carouselLibrary.ts), so a saved quiz carousel can be found, but Write cannot make one.

## Build

1. A fifth choice in Write's format step: A practice question.
2. The writer drafts one question from the user's field (a tax rule, a policy term, a pricing trap), three or four answers, and the answer with the usual mistake explained.
3. On Instagram and LinkedIn it lays out as a carousel: the question, the answers, the explanation on the last slide. As a text post it puts the answer in the first comment.
4. It ends with one line inviting readers to send their own case, never a pitch.
5. Every post runs the same compliance check as any other, and an adviser's question never names a product.
6. It uses the same writing call and caps as a carousel or text post. No new AI call.

## Done when

- A user can pick A practice question in Write and get a carousel or a text post with the answer kept out of the first slide or the post body.
- The compliance check runs on it as on every post.

## Tests

- The format shows in Write's format step.
- The carousel version never puts the answer on the first slide.
- The text post version puts the answer in the first comment.

## Open questions

- Show it to every profession, or to advisers first? Recommended: every profession, since a coach's or a broker's question works the same way.

## Related

- formats-carousel-designs, formats-text-threads, edit-carousel.
