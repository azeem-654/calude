-- AI Video Studio, second step: what a project was asked to make beyond
-- video (repurposed posts, blog and emails; a quiz) and what came of it.
-- JSON: {want: {repurpose?: {posts, blog, email}, quiz?: true}, repurposed?: {...}, quiz?: {...}}
ALTER TABLE crm_video_projects ADD COLUMN extras TEXT NOT NULL DEFAULT '{}';
