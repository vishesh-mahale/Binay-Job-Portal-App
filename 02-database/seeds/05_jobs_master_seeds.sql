-- ============================================================================
-- MASTER DATA SEED SCRIPT FOR JOB PORTAL
-- File: 02-database/seeds/05_jobs_master_seeds.sql
-- 
-- Purpose:
--   Populates production-grade master categories (job_categories) and canonical
--   skills catalog (skills) into the database.
-- 
-- Idempotency:
--   Uses ON CONFLICT (slug) DO UPDATE / DO NOTHING so it can be safely re-run
--   in dev, staging, or production without duplicate errors or data loss.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SEED JOB CATEGORIES (Hierarchical: Top-level & Sub-categories)
-- ============================================================================

-- Top-Level Categories
INSERT INTO public.job_categories (id, name, slug, description, parent_id, icon, sort_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Engineering & Software Development', 'engineering', 'Software engineering, web, mobile, infrastructure, and DevOps roles', NULL, 'code', 1, true),
  ('c0000000-0000-0000-0000-000000000002', 'Data & Artificial Intelligence', 'data-ai', 'Data science, analytics, machine learning, and AI engineering', NULL, 'database', 2, true),
  ('c0000000-0000-0000-0000-000000000003', 'Product & Design', 'product-design', 'Product management, UI/UX design, and user research', NULL, 'layout', 3, true),
  ('c0000000-0000-0000-0000-000000000004', 'Sales & Business Development', 'sales-bizdev', 'Enterprise sales, account management, and business development', NULL, 'trending-up', 4, true),
  ('c0000000-0000-0000-0000-000000000005', 'Marketing & Content', 'marketing-content', 'Digital marketing, SEO, content creation, and brand management', NULL, 'megaphone', 5, true),
  ('c0000000-0000-0000-0000-000000000006', 'Human Resources & Talent', 'hr-recruiting', 'Technical recruiting, HR operations, and talent management', NULL, 'users', 6, true),
  ('c0000000-0000-0000-0000-000000000007', 'Finance & Accounting', 'finance-accounting', 'Financial planning, accounting, auditing, and tax management', NULL, 'dollar-sign', 7, true),
  ('c0000000-0000-0000-0000-000000000008', 'Operations & Logistics', 'operations-logistics', 'Business operations, supply chain, and logistics management', NULL, 'briefcase', 8, true),
  ('c0000000-0000-0000-0000-000000000009', 'Customer Support & Success', 'customer-support', 'Customer support, technical support, and customer success', NULL, 'headphones', 9, true),
  ('c0000000-0000-0000-0000-000000000010', 'Legal & Compliance', 'legal-compliance', 'Legal counsel, regulatory compliance, and corporate governance', NULL, 'shield', 10, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Sub-Categories for Engineering
INSERT INTO public.job_categories (id, name, slug, description, parent_id, icon, sort_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000101', 'Backend Development', 'backend-development', 'Server-side API, database, and microservices engineering', 'c0000000-0000-0000-0000-000000000001', 'server', 1, true),
  ('c0000000-0000-0000-0000-000000000102', 'Frontend Development', 'frontend-development', 'Web client UI, single-page apps, and frontend performance', 'c0000000-0000-0000-0000-000000000001', 'monitor', 2, true),
  ('c0000000-0000-0000-0000-000000000103', 'Fullstack Development', 'fullstack-development', 'End-to-end full stack web application development', 'c0000000-0000-0000-0000-000000000001', 'layers', 3, true),
  ('c0000000-0000-0000-0000-000000000104', 'Mobile App Development', 'mobile-development', 'iOS (Swift/SwiftUI) and Android (Kotlin/Flutter/React Native)', 'c0000000-0000-0000-0000-000000000001', 'smartphone', 4, true),
  ('c0000000-0000-0000-0000-000000000105', 'DevOps & Cloud Infrastructure', 'devops-cloud', 'Cloud infrastructure, CI/CD pipelines, Docker, and Kubernetes', 'c0000000-0000-0000-0000-000000000001', 'cloud', 5, true),
  ('c0000000-0000-0000-0000-000000000106', 'Quality Assurance & Testing', 'qa-testing', 'Automated testing, QA engineering, and performance testing', 'c0000000-0000-0000-0000-000000000001', 'check-circle', 6, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  parent_id = EXCLUDED.parent_id,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Sub-Categories for Data & AI
INSERT INTO public.job_categories (id, name, slug, description, parent_id, icon, sort_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000201', 'Data Engineering', 'data-engineering', 'Data pipelines, ETL workflows, and data warehouse architecture', 'c0000000-0000-0000-0000-000000000002', 'cpu', 1, true),
  ('c0000000-0000-0000-0000-000000000202', 'Data Science & Analytics', 'data-science', 'Statistical modeling, business intelligence, and predictive analytics', 'c0000000-0000-0000-0000-000000000002', 'bar-chart-2', 2, true),
  ('c0000000-0000-0000-0000-000000000203', 'Machine Learning & AI', 'machine-learning-ai', 'LLM fine-tuning, neural networks, computer vision, and AI models', 'c0000000-0000-0000-0000-000000000002', 'zap', 3, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  parent_id = EXCLUDED.parent_id,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();


-- ============================================================================
-- 2. SEED MASTER SKILLS CATALOG (public.skills)
-- ============================================================================

DO $$
DECLARE
  v_system_user_id UUID;
BEGIN
  SELECT id INTO v_system_user_id FROM public.users WHERE role = 'admin' LIMIT 1;
  IF v_system_user_id IS NULL THEN
    SELECT id INTO v_system_user_id FROM public.users LIMIT 1;
  END IF;

  -- Insert Master Skills
  INSERT INTO public.skills (id, name, slug, aliases, description, is_active, created_by)
  VALUES
    -- Backend & Core Languages
    (gen_random_uuid(), 'TypeScript', 'typescript', '["TS", "Type Script"]'::jsonb, 'Strongly typed programming language building on JavaScript', true, v_system_user_id),
    (gen_random_uuid(), 'JavaScript', 'javascript', '["JS", "ECMAScript", "ES6+"]'::jsonb, 'Dynamic programming language for client and server web apps', true, v_system_user_id),
    (gen_random_uuid(), 'Node.js', 'nodejs', '["Node", "NodeJS", "Node JS"]'::jsonb, 'Asynchronous event-driven JavaScript runtime', true, v_system_user_id),
    (gen_random_uuid(), 'NestJS', 'nestjs', '["Nest", "Nest.js", "NestJS Framework"]'::jsonb, 'Progressive Node.js framework for scalable server-side apps', true, v_system_user_id),
    (gen_random_uuid(), 'Python', 'python', '["Python3", "Py"]'::jsonb, 'High-level programming language for web, AI, and data science', true, v_system_user_id),
    (gen_random_uuid(), 'Java', 'java', '["Java 17", "Java 21", "J2EE"]'::jsonb, 'Class-based object-oriented programming language for enterprise software', true, v_system_user_id),
    (gen_random_uuid(), 'Go (Golang)', 'golang', '["Go", "Golang"]'::jsonb, 'Statically typed, compiled programming language designed at Google', true, v_system_user_id),
    (gen_random_uuid(), 'C# / .NET', 'csharp-dotnet', '["C#", ".NET Core", "ASP.NET"]'::jsonb, 'Object-oriented language for Microsoft .NET ecosystem', true, v_system_user_id),
    (gen_random_uuid(), 'PHP', 'php', '["PHP8", "Laravel PHP"]'::jsonb, 'Server-side scripting language for web development', true, v_system_user_id),
    (gen_random_uuid(), 'Ruby', 'ruby', '["Ruby on Rails", "RoR"]'::jsonb, 'Dynamic language focused on simplicity and productivity', true, v_system_user_id),

    -- Frontend Frameworks
    (gen_random_uuid(), 'React', 'react', '["React.js", "ReactJS"]'::jsonb, 'Front-end JavaScript library for building user interfaces', true, v_system_user_id),
    (gen_random_uuid(), 'Next.js', 'nextjs', '["Next", "NextJS", "Next.js 14", "Next.js 15"]'::jsonb, 'React framework for server-side rendering and static web apps', true, v_system_user_id),
    (gen_random_uuid(), 'Vue.js', 'vuejs', '["Vue", "VueJS", "Vue 3"]'::jsonb, 'Progressive JavaScript framework for building UIs', true, v_system_user_id),
    (gen_random_uuid(), 'Angular', 'angular', '["AngularJS", "Angular 2+"]'::jsonb, 'TypeScript-based web application framework by Google', true, v_system_user_id),
    (gen_random_uuid(), 'Tailwind CSS', 'tailwindcss', '["Tailwind", "TailwindCSS"]'::jsonb, 'Utility-first CSS framework for rapid UI development', true, v_system_user_id),
    (gen_random_uuid(), 'HTML5 / CSS3', 'html-css', '["HTML", "CSS", "Responsive Web Design"]'::jsonb, 'Core web markup and stylesheet standards', true, v_system_user_id),

    -- Databases & Caching
    (gen_random_uuid(), 'PostgreSQL', 'postgresql', '["Postgres", "PG", "PostgreSQL 16"]'::jsonb, 'Advanced open-source relational database management system', true, v_system_user_id),
    (gen_random_uuid(), 'MongoDB', 'mongodb', '["Mongo", "NoSQL Mongo"]'::jsonb, 'Document-based distributed NoSQL database', true, v_system_user_id),
    (gen_random_uuid(), 'Redis', 'redis', '["Redis Cache", "In-Memory Store"]'::jsonb, 'In-memory data structure store used as database and cache', true, v_system_user_id),
    (gen_random_uuid(), 'MySQL', 'mysql', '["MariaDB", "MySQL 8"]'::jsonb, 'Widely used relational database management system', true, v_system_user_id),
    (gen_random_uuid(), 'Elasticsearch', 'elasticsearch', '["ELK Stack", "Elastic"]'::jsonb, 'Distributed search and analytics engine', true, v_system_user_id),

    -- Cloud & DevOps
    (gen_random_uuid(), 'Docker', 'docker', '["Containers", "Docker Compose"]'::jsonb, 'Platform for developing, shipping, and running applications in containers', true, v_system_user_id),
    (gen_random_uuid(), 'Kubernetes', 'kubernetes', '["K8s", "Kube"]'::jsonb, 'Open-source container orchestration platform', true, v_system_user_id),
    (gen_random_uuid(), 'AWS', 'aws', '["Amazon Web Services", "EC2", "S3", "Lambda"]'::jsonb, 'Comprehensive cloud computing platform by Amazon', true, v_system_user_id),
    (gen_random_uuid(), 'Google Cloud Platform', 'gcp', '["GCP", "Google Cloud"]'::jsonb, 'Suite of cloud computing services by Google', true, v_system_user_id),
    (gen_random_uuid(), 'Git & GitHub', 'git-github', '["Git", "GitHub", "GitLab"]'::jsonb, 'Distributed version control system and repository hosting', true, v_system_user_id),
    (gen_random_uuid(), 'CI/CD Pipelines', 'cicd', '["Continuous Integration", "GitHub Actions", "Jenkins"]'::jsonb, 'Automated software build, test, and deployment workflows', true, v_system_user_id),

    -- AI, Data & Analytics
    (gen_random_uuid(), 'Machine Learning', 'machine-learning', '["ML", "Predictive Modeling"]'::jsonb, 'Study of algorithms that improve automatically through experience', true, v_system_user_id),
    (gen_random_uuid(), 'Deep Learning & PyTorch', 'pytorch-deep-learning', '["PyTorch", "TensorFlow", "Neural Networks"]'::jsonb, 'Deep neural network frameworks for AI model development', true, v_system_user_id),
    (gen_random_uuid(), 'Pandas & NumPy', 'pandas-numpy', '["Data Analysis", "Python Data"]'::jsonb, 'Python libraries for data manipulation and numerical computation', true, v_system_user_id),

    -- Product, Design & Management
    (gen_random_uuid(), 'UI/UX Design', 'ui-ux-design', '["User Experience", "User Interface", "Product Design"]'::jsonb, 'User interface and experience design methodologies', true, v_system_user_id),
    (gen_random_uuid(), 'Figma', 'figma', '["Figma Design", "Prototyping"]'::jsonb, 'Collaborative web-based interface design tool', true, v_system_user_id),
    (gen_random_uuid(), 'Product Strategy', 'product-strategy', '["Product Management", "Roadmap Planning"]'::jsonb, 'Defining product vision, market positioning, and execution roadmaps', true, v_system_user_id),
    (gen_random_uuid(), 'Agile / Scrum', 'agile-scrum', '["Scrum", "Agile Methodology", "Sprint Planning"]'::jsonb, 'Iterative project management and software development framework', true, v_system_user_id),

    -- Business, HR & General
    (gen_random_uuid(), 'Technical Recruiting', 'technical-recruiting', '["IT Sourcing", "Talent Acquisition"]'::jsonb, 'Sourcing, screening, and hiring technical talent', true, v_system_user_id),
    (gen_random_uuid(), 'B2B Sales', 'b2b-sales', '["Enterprise Sales", "Account Management"]'::jsonb, 'Business-to-business sales and relationship management', true, v_system_user_id),
    (gen_random_uuid(), 'Digital Marketing & SEO', 'digital-marketing-seo', '["SEO", "SEM", "Content Marketing"]'::jsonb, 'Search engine optimization and digital campaign management', true, v_system_user_id),
    (gen_random_uuid(), 'Project Management', 'project-management', '["PMP", "Project Delivery"]'::jsonb, 'Planning, executing, and closing business projects', true, v_system_user_id)
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    aliases = EXCLUDED.aliases,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = NOW();

END $$;

COMMIT;

-- Output Verification Counts
SELECT 'job_categories count' AS table_name, count(*) FROM public.job_categories
UNION ALL
SELECT 'skills count' AS table_name, count(*) FROM public.skills;
