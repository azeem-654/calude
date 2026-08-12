import { useMemo } from 'react';
import { buildBook, type Book, type FeedInput } from '../../services/marketFeed';

/**
 * The replayed book, computed once for the whole dashboard.
 *
 * Both the progress board and the day board want it, and replaying the entire
 * event history is the expensive part — so it is built here and passed down
 * rather than each panel memoising its own copy of the same walk.
 */
export function useProgressBook(input: FeedInput): Book {
  const {
    contacts, pipelines, appointments, conversations, campaigns,
    reviews, funnels, websites, videoProjects, socialPosts,
  } = input;
  return useMemo(
    () => buildBook(
      { contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts },
      '1D',
    ),
    [contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts],
  );
}
