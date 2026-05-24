import { useState, useRef, Fragment } from 'react';
import type { CSSProperties } from 'react';
import {
  X, Save, Eye, EyeOff, Monitor, Tablet, Smartphone,
  Plus, Trash2, Copy, ChevronUp, ChevronDown,
  Type, AlignLeft, MousePointerClick, Minus,
  Layers, Star, Check, Undo2, Redo2,
  Settings, Navigation, Timer, Layout,
} from 'lucide-react';
import type { Funnel, FunnelStep, FunnelBlock } from '../../types';

let DRAG_TYPE: 'new' | 'move' | null = null;
let DRAG_PAYLOAD = '';
const uid = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
type Device = 'desktop' | 'tablet' | 'mobile';
type LeftTab = 'elements' | 'templates' | 'pages';
type BlockType = FunnelBlock['type'];

const DEFAULTS: Record<BlockType, FunnelBlock['settings']> = {
  navbar: { bgColor: '#ffffff', textColor: '#0f172a', navLogo: 'YourBrand', buttonText: 'Get Started', buttonColor: '#6366f1', buttonTextColor: '#ffffff', navLinks: [{ label: 'Features', url: '#' }, { label: 'Pricing', url: '#' }, { label: 'About', url: '#' }] },
  hero: { bgGradient: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', textColor: '#ffffff', subheading: 'The all-in-one platform to grow your business faster.', buttonText: 'Get Started Free', buttonColor: '#ffffff', buttonTextColor: '#6366f1', secondaryButtonText: 'Watch Demo', align: 'center', minHeight: 520, padding: 80 },
  features: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Everything you need to succeed', align: 'center', iconColor: '#6366f1', columns: 3, padding: 80, featureItems: [{ icon: '⚡', title: 'Lightning Fast', desc: 'Built for performance with cutting-edge technology.' }, { icon: '🔒', title: 'Secure by Default', desc: 'Enterprise-grade security out of the box.' }, { icon: '📊', title: 'Advanced Analytics', desc: 'Real-time insights that help you decide better.' }, { icon: '🤝', title: 'Team Collaboration', desc: 'Work seamlessly together from anywhere.' }, { icon: '🌍', title: 'Global Scale', desc: 'Serve customers reliably worldwide, 24/7.' }, { icon: '🎯', title: 'Easy to Use', desc: 'Intuitive interface your team will love.' }] },
  testimonials: { bgColor: '#ffffff', textColor: '#0f172a', subtitle: 'Loved by thousands of customers worldwide', align: 'center', padding: 80, testimonialItems: [{ quote: 'This platform completely transformed how our team operates. Revenue doubled in 6 months.', author: 'Sarah Johnson', role: 'CEO at TechCorp', stars: 5 }, { quote: 'Incredible ROI. 3x improvement in conversion rate within the first month of using this.', author: 'Marcus Williams', role: 'CMO at GrowthHQ', stars: 5 }, { quote: 'The support team is world-class. Setup was quick and results speak for themselves.', author: 'Emily Chen', role: 'Founder at StartupXYZ', stars: 5 }] },
  pricing: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Simple, transparent pricing for every team', align: 'center', padding: 80, pricingPlans: [{ name: 'Starter', price: '$29', period: '/month', features: ['5 users', '10GB storage', 'Basic analytics', 'Email support'], highlighted: false, buttonText: 'Start Free Trial' }, { name: 'Pro', price: '$79', period: '/month', features: ['Unlimited users', '100GB storage', 'Advanced analytics', 'Priority support', 'Custom integrations', 'API access'], highlighted: true, buttonText: 'Get Started' }, { name: 'Enterprise', price: 'Custom', period: '', features: ['Unlimited everything', 'Dedicated infrastructure', 'Custom reporting', '24/7 phone support', 'SLA guarantee'], highlighted: false, buttonText: 'Contact Sales' }] },
  columns: { bgColor: '#ffffff', textColor: '#0f172a', subheading: 'We help ambitious companies achieve their goals faster with cutting-edge solutions.', buttonText: 'Learn More', buttonColor: '#6366f1', buttonTextColor: '#ffffff', imagePosition: 'right', imageUrl: '', listItems: ['Streamline your entire workflow end-to-end', 'Automate repetitive tasks and save hours daily', 'Get real-time insights and actionable analytics', 'Scale from startup to enterprise without friction'], padding: 80 },
  cta: { bgGradient: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)', textColor: '#ffffff', subheading: 'Join over 10,000 companies already growing with our platform.', buttonText: 'Start Your Free Trial', buttonColor: '#ffffff', buttonTextColor: '#6366f1', secondaryButtonText: 'Schedule a Demo', align: 'center', padding: 80 },
  stats: { bgColor: '#0f172a', textColor: '#ffffff', padding: 60, statItems: [{ value: '10,000+', label: 'Happy Customers', icon: '😊' }, { value: '99.9%', label: 'Uptime SLA', icon: '⚡' }, { value: '$2.4B', label: 'Revenue Generated', icon: '💰' }, { value: '4.9/5', label: 'Average Rating', icon: '⭐' }] },
  faq: { bgColor: '#ffffff', textColor: '#0f172a', subtitle: 'Everything you need to know', align: 'left', padding: 80, faqItems: [{ q: 'How does the free trial work?', a: 'Start with a 14-day free trial with full access. No credit card required.' }, { q: 'Can I change my plan later?', a: 'Yes! Upgrade or downgrade at any time. Changes take effect immediately.' }, { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, PayPal, and bank wire for annual plans.' }, { q: 'Is there a long-term contract?', a: 'No contracts. All plans are month-to-month. Annual plans have a 20% discount.' }, { q: 'Do you offer customer support?', a: 'All plans include email support. Pro/Enterprise include priority support.' }] },
  footer: { bgColor: '#0f172a', textColor: '#94a3b8', navLogo: 'YourBrand', padding: 60, footerColumns: [{ heading: 'Product', links: [{ label: 'Features', url: '#' }, { label: 'Pricing', url: '#' }, { label: 'Changelog', url: '#' }] }, { heading: 'Company', links: [{ label: 'About', url: '#' }, { label: 'Blog', url: '#' }, { label: 'Careers', url: '#' }] }, { heading: 'Support', links: [{ label: 'Docs', url: '#' }, { label: 'Help Center', url: '#' }, { label: 'Contact', url: '#' }] }], footerCopyright: `© ${new Date().getFullYear()} YourBrand Inc. All rights reserved.` },
  gallery: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Our work speaks for itself', columns: 3, galleryImages: ['#e0e7ff', '#ddd6fe', '#fce7f3', '#fee2e2', '#d1fae5', '#fef3c7'], padding: 60, align: 'center' },
  heading: { size: 'xl', color: '#0f172a', align: 'center', padding: 16, fontWeight: '700' },
  text: { size: 'md', color: '#64748b', align: 'center', padding: 12 },
  button: { buttonColor: '#6366f1', buttonTextColor: '#ffffff', align: 'center', buttonText: 'Click Here', url: '#', padding: 20, borderRadius: 8 },
  image: { align: 'center', imageUrl: '', imageAlt: 'Image', padding: 16, shadow: false, borderRadius: 0 },
  video: { align: 'center', url: '', padding: 24 },
  form: { bgColor: '#f8fafc', buttonColor: '#6366f1', buttonTextColor: '#ffffff', buttonText: 'Submit Now', align: 'center', padding: 48, formFields: [{ label: 'Full Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }], redirectUrl: '' },
  divider: { color: '#e2e8f0', padding: 16 },
  spacer: { padding: 60 },
  countdown: { bgColor: '#0f172a', textColor: '#ffffff', subheading: "Don't miss out — offer ends soon!", align: 'center', padding: 60 },
};

const DEFAULT_CONTENT: Record<BlockType, string> = {
  navbar: '', hero: 'Transform Your Business Today', features: 'Why Choose Us',
  testimonials: 'What Our Customers Say', pricing: 'Simple, Transparent Pricing',
  columns: 'Grow Faster With Us', cta: 'Ready to Get Started?', stats: '',
  faq: 'Frequently Asked Questions', footer: '', gallery: 'Our Portfolio',
  heading: 'Your Headline Here', text: 'Add your body text here. Describe your value clearly.',
  button: 'Click Here', image: '', video: '', form: 'Get In Touch',
  divider: '', spacer: '', countdown: 'Limited Time Offer',
};

function createBlock(type: BlockType, content = '', extra: FunnelBlock['settings'] = {}): FunnelBlock {
  return { id: uid(), type, content: content || DEFAULT_CONTENT[type], settings: { ...DEFAULTS[type], ...extra } };
}
let _ti = 0;
function mk(type: BlockType, content = '', extra: FunnelBlock['settings'] = {}): FunnelBlock {
  return { id: `t${++_ti}`, type, content: content || DEFAULT_CONTENT[type], settings: { ...DEFAULTS[type], ...extra } };
}
let _pi = 0;
function mkPage(name: string, type: FunnelStep['type'] = 'landing'): FunnelStep {
  return { id: `p${++_pi}`, name, type, slug: name.toLowerCase().replace(/\s+/g, '-'), blocks: [], visitors: 0, conversions: 0 };
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
interface Template { id: string; name: string; category: string; emoji: string; heroColor: string; desc: string; pages: { name: string; type: FunnelStep['type']; blocks: FunnelBlock[] }[]; }

const TEMPLATES: Template[] = [
  { id: 'saas', name: 'SaaS Landing Page', category: 'Landing', emoji: '🚀', heroColor: 'linear-gradient(135deg,#667eea,#764ba2)', desc: 'Modern SaaS page with features, pricing & social proof.', pages: [{ name: 'Landing', type: 'landing', blocks: [mk('navbar'), mk('hero', 'Build Better Products, Faster', { bgGradient: 'linear-gradient(135deg,#667eea,#764ba2)', subheading: 'The platform 10,000+ teams trust to ship great software.', buttonText: 'Start Free Trial', secondaryButtonText: 'See It in Action' }), mk('stats', '', { bgColor: '#0f172a', statItems: [{ value: '10,000+', label: 'Companies', icon: '🏢' }, { value: '99.9%', label: 'Uptime', icon: '⚡' }, { value: '50M+', label: 'Tasks Done', icon: '✅' }, { value: '4.9★', label: 'App Store', icon: '⭐' }] }), mk('features', 'Everything Your Team Needs', { subtitle: 'Stop juggling 10 tools. Everything in one workspace.' }), mk('columns', 'Built for Teams That Move Fast', { subheading: 'Scales from 5 to 5,000 employees without friction.', listItems: ['Real-time collaboration across all projects', 'Automated workflows that save hours daily', 'Powerful integrations with 200+ tools', 'Enterprise security and compliance built-in'] }), mk('testimonials', 'Trusted by Industry Leaders'), mk('pricing', 'Start Free, Scale as You Grow'), mk('cta', 'Join 10,000+ Growing Companies', { subheading: 'Free 14-day trial. No credit card required.' }), mk('footer')] }] },
  { id: 'agency', name: 'Digital Agency', category: 'Website', emoji: '🎨', heroColor: '#0f172a', desc: 'Bold dark-theme agency site with portfolio and services.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { bgColor: '#0f172a', textColor: '#ffffff', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mk('hero', 'We Design Digital Futures', { bgGradient: 'linear-gradient(135deg,#0f172a,#1e293b)', subheading: 'Award-winning creative agency — brand, web, and digital strategy.', buttonText: 'View Our Work', buttonColor: '#f59e0b', buttonTextColor: '#0f172a', secondaryButtonText: 'Start a Project' }), mk('stats', '', { bgColor: '#f59e0b', textColor: '#0f172a', statItems: [{ value: '200+', label: 'Projects', icon: '🚀' }, { value: '98%', label: 'Satisfaction', icon: '❤️' }, { value: '15yr', label: 'Experience', icon: '🏆' }, { value: '$50M+', label: 'Revenue Generated', icon: '💰' }] }), mk('features', 'Our Services', { bgColor: '#ffffff', featureItems: [{ icon: '🎨', title: 'Brand Identity', desc: 'Logos and visual systems that make you unforgettable.' }, { icon: '💻', title: 'Web Design', desc: 'Beautiful, conversion-focused websites.' }, { icon: '📈', title: 'Digital Strategy', desc: 'Data-driven strategies that grow revenue.' }, { icon: '📱', title: 'Mobile Apps', desc: 'Native iOS and Android apps users love.' }, { icon: '🎬', title: 'Video & Motion', desc: 'Compelling videos that tell your story.' }, { icon: '🔍', title: 'SEO & Growth', desc: 'Organic growth that compounds over time.' }] }), mk('gallery', 'Recent Projects', { galleryImages: ['#6366f1', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'] }), mk('testimonials', 'What Clients Say', { bgColor: '#0f172a', testimonialItems: [{ quote: 'They transformed our brand. New identity increased leads by 400% in 3 months.', author: 'James Fletcher', role: 'CEO, Nexus Corp', stars: 5 }, { quote: 'Incredible attention to detail. Best agency we have ever worked with.', author: 'Priya Sharma', role: 'CMO, FutureScale', stars: 5 }, { quote: 'Delivered on time, on budget. Website traffic tripled post-launch.', author: 'Tom Bridgewater', role: 'Founder, Elevate Media', stars: 5 }] }), mk('cta', "Let's Build Something Great Together", { bgGradient: 'linear-gradient(135deg,#f59e0b,#f97316)', textColor: '#0f172a', buttonText: 'Start a Project', buttonColor: '#0f172a', buttonTextColor: '#ffffff' }), mk('footer')] }] },
  { id: 'lead', name: 'Lead Magnet Funnel', category: 'Funnel', emoji: '🎯', heroColor: 'linear-gradient(135deg,#22c55e,#16a34a)', desc: 'High-converting lead capture funnel for a free resource.', pages: [{ name: 'Opt-in', type: 'optin', blocks: [mk('hero', 'FREE Guide: 10 Secrets to Double Your Revenue in 90 Days', { bgGradient: 'linear-gradient(135deg,#16a34a,#15803d)', subheading: 'Join 50,000+ entrepreneurs using these strategies to grow faster. Get instant access.', buttonText: 'Yes! Send Me the Free Guide ↓', secondaryButtonText: undefined }), mk('stats', '', { bgColor: '#f0fdf4', textColor: '#0f172a', statItems: [{ value: '50,000+', label: 'Downloads', icon: '📥' }, { value: '94%', label: 'Satisfaction', icon: '⭐' }, { value: '10 min', label: 'Quick Read', icon: '⚡' }] }), mk('columns', "What You'll Discover Inside", { subheading: 'The exact framework top companies use to grow revenue without increasing ad spend.', listItems: ['The #1 mistake killing your conversion rate', 'Our proven 3-step lead qualification framework', 'Email sequences that convert 40% better', 'Turning one-time buyers into lifetime customers'], buttonText: 'Get Free Access Now', buttonColor: '#22c55e' }), mk('form', 'Yes! Send Me the Free Guide', { bgColor: '#f0fdf4', buttonColor: '#22c55e', buttonText: 'Send Me the Free Guide →', formFields: [{ label: 'First Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }] }), mk('text', '🔒 100% Private. Never shared or sold. Unsubscribe anytime.', { color: '#94a3b8', align: 'center', size: 'sm' })] }] },
  { id: 'launch', name: 'Product Launch', category: 'Funnel', emoji: '🔥', heroColor: 'linear-gradient(135deg,#f97316,#ef4444)', desc: 'Build launch hype with countdown timer and early pricing.', pages: [{ name: 'Launch', type: 'landing', blocks: [mk('hero', 'Introducing the Future of Project Management', { bgGradient: 'linear-gradient(135deg,#1e293b,#0f172a)', subheading: 'The tool 10,000+ teams have been waiting for. Launching January 15, 2025.', buttonText: 'Join the Waitlist', buttonColor: '#f97316' }), mk('countdown', 'Launch Countdown', { bgColor: '#f97316', textColor: '#ffffff', subheading: 'Early bird pricing — 50% off — for the first 1,000 customers only.' }), mk('features', 'What Makes Us Different', { featureItems: [{ icon: '🎯', title: 'AI-Powered Planning', desc: 'Our AI auto-prioritizes tasks and predicts blockers before they happen.' }, { icon: '⚡', title: '10x Faster Setup', desc: 'From zero to fully productive in under 5 minutes.' }, { icon: '🔗', title: '300+ Integrations', desc: 'Works with every tool your team already uses.' }], columns: 3 }), mk('testimonials', 'What Beta Testers Are Saying', { bgColor: '#0f172a', testimonialItems: [{ quote: "I used the beta for 2 weeks and it replaced 3 other tools. Game changer.", author: 'Alex Rivera', role: 'Product Manager', stars: 5 }, { quote: "The AI suggestions alone saved our team 10+ hours per week.", author: 'Nina Patel', role: 'CTO, GrowthCo', stars: 5 }, { quote: "We've tried every PM tool. This is the one we're keeping.", author: 'David Kim', role: 'Founder, DevStudio', stars: 5 }] }), mk('form', 'Get Early Access', { bgColor: '#fff7ed', buttonColor: '#f97316', buttonText: 'Join the Waitlist →', formFields: [{ label: 'Full Name', type: 'text', required: true }, { label: 'Work Email', type: 'email', required: true }] })] }] },
  { id: 'webinar', name: 'Webinar Registration', category: 'Funnel', emoji: '🎤', heroColor: 'linear-gradient(135deg,#0ea5e9,#6366f1)', desc: 'Professional webinar sign-up page with speaker bio.', pages: [{ name: 'Register', type: 'webinar', blocks: [mk('hero', 'FREE Masterclass: Scale to $1M ARR Without Burning Out', { bgGradient: 'linear-gradient(135deg,#0ea5e9,#6366f1)', subheading: '📅 Tuesday, January 21 · 2:00 PM EST · 60 Minutes · Free to Attend', buttonText: 'Reserve My Free Spot →' }), mk('features', "In This Masterclass, You'll Learn:", { bgColor: '#f8fafc', featureItems: [{ icon: '1️⃣', title: 'The $1M Growth Framework', desc: 'Exact system to grow from $0 to $1M ARR in under 18 months.' }, { icon: '2️⃣', title: 'Hiring Your First 10 Employees', desc: 'When, who, and how to hire without costly mistakes.' }, { icon: '3️⃣', title: 'Fundraising vs. Bootstrapping', desc: 'Decide which path is right for your specific goals.' }, { icon: '4️⃣', title: 'Live Q&A Session', desc: 'Get your specific questions answered directly.' }], columns: 2 }), mk('columns', 'Your Host: Jennifer Masters', { subheading: 'Serial entrepreneur who built and sold 3 SaaS companies, raised $20M+ in funding.', imagePosition: 'left', imageUrl: '#6366f1', listItems: ['Featured in Forbes, TechCrunch & Inc.', '3x successful SaaS founder (2 exits)', '$20M+ raised across portfolio', 'Mentor at Y Combinator & Techstars'] }), mk('form', 'Reserve Your Free Spot Now', { bgColor: '#eff6ff', buttonColor: '#6366f1', buttonText: 'Reserve My Free Spot →', formFields: [{ label: 'First Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }] }), mk('stats', '', { bgColor: '#0f172a', statItems: [{ value: '15,000+', label: 'Past Attendees', icon: '👥' }, { value: '97%', label: 'Would Recommend', icon: '❤️' }, { value: '60 min', label: 'Packed With Value', icon: '⏱️' }, { value: 'FREE', label: 'Always Free', icon: '🎁' }] })] }] },
  { id: 'ecommerce', name: 'eCommerce Product', category: 'Landing', emoji: '🛍️', heroColor: '#ffffff', desc: 'Product sales page with image, reviews, and purchase CTA.', pages: [{ name: 'Product', type: 'sales', blocks: [mk('navbar', '', { buttonText: 'Shop Now', buttonColor: '#ec4899' }), mk('columns', 'The ProFit Smart Water Bottle', { subheading: 'Stay hydrated and track your health goals. Connects to your phone, reminds you to drink, tracks your intake automatically.', imagePosition: 'left', imageUrl: '#ec4899', listItems: ['💧 Tracks hydration via smart sensor', '📱 Syncs with iOS & Android apps', '🌡️ Cold 24h or hot 12h', '♻️ 100% recycled BPA-free materials'], buttonText: 'Buy Now — $79', buttonColor: '#ec4899' }), mk('stats', '', { bgColor: '#fdf2f8', textColor: '#0f172a', statItems: [{ value: '50,000+', label: 'Happy Customers', icon: '😊' }, { value: '4.9★', label: 'Average Rating', icon: '⭐' }, { value: '2-day', label: 'Free Shipping', icon: '🚚' }, { value: '60-day', label: 'Money-Back', icon: '✅' }] }), mk('testimonials', 'Real Reviews From Real Customers', { bgColor: '#fdf2f8', testimonialItems: [{ quote: "I've tried so many water bottles. This is the only one that made me drink more consistently.", author: 'Rachel Green', role: 'Verified Buyer ✓', stars: 5 }, { quote: "The app integration is incredible. Finally track hydration alongside my other health metrics.", author: 'Mike Thompson', role: 'Verified Buyer ✓', stars: 5 }, { quote: "Beautiful design and the battery lasts forever. Got one for my whole family.", author: 'Lisa Wang', role: 'Verified Buyer ✓', stars: 5 }] }), mk('cta', 'Limited Stock — Order Yours Today', { bgGradient: 'linear-gradient(135deg,#ec4899,#f97316)', subheading: 'Free shipping. 60-day money-back guarantee. No questions asked.', buttonText: 'Order Now — $79', buttonColor: '#ffffff', buttonTextColor: '#ec4899' }), mk('footer')] }] },
  { id: 'course', name: 'Online Course', category: 'Landing', emoji: '🎓', heroColor: 'linear-gradient(135deg,#0891b2,#6366f1)', desc: 'Course sales page with curriculum, instructor, and enrollment.', pages: [{ name: 'Course', type: 'sales', blocks: [mk('navbar', '', { bgColor: '#0f172a', textColor: '#ffffff', buttonText: 'Enroll Now', buttonColor: '#0891b2' }), mk('hero', 'Master Web Development in 12 Weeks', { bgGradient: 'linear-gradient(135deg,#0891b2,#6366f1)', subheading: 'Go from beginner to job-ready full-stack developer. 200+ students hired at top companies.', buttonText: 'Enroll Now — $497', secondaryButtonText: 'See Curriculum' }), mk('stats', '', { bgColor: '#f0f9ff', textColor: '#0f172a', statItems: [{ value: '5,000+', label: 'Students', icon: '🎓' }, { value: '12 Weeks', label: 'Structured', icon: '📅' }, { value: '200+', label: 'Hired', icon: '💼' }, { value: '4.8★', label: 'Rating', icon: '⭐' }] }), mk('features', "What's Included", { bgColor: '#ffffff', subtitle: '12 modules, 80+ video lessons, 20+ real projects', featureItems: [{ icon: '🌐', title: 'HTML, CSS & JS', desc: 'Master the fundamentals with hands-on projects.' }, { icon: '⚛️', title: 'React & Next.js', desc: 'Build modern apps using today\'s top frameworks.' }, { icon: '🗄️', title: 'Node.js & Databases', desc: 'Backend with Node, Express, PostgreSQL and MongoDB.' }, { icon: '☁️', title: 'Cloud & Deployment', desc: 'Deploy to AWS, Vercel, and other cloud platforms.' }, { icon: '💼', title: 'Career Coaching', desc: 'Resume reviews, mock interviews, job search strategy.' }, { icon: '👥', title: 'Community Access', desc: 'Private Discord with 5,000+ developers.' }] }), mk('columns', 'Your Instructor: David Chen', { bgColor: '#f0f9ff', subheading: 'Senior engineer at Google with 12 years of experience. Built products used by millions.', imagePosition: 'left', imageUrl: '#0891b2', listItems: ['Former Google & Meta Senior Engineer', 'Built products used by 50M+ users', '12 years full-stack development', '#1 Bestselling Instructor on Udemy'] }), mk('testimonials', 'Student Success Stories', { testimonialItems: [{ quote: "Went from zero coding to a $110K job at a fintech startup in 4 months. Best investment ever.", author: 'Carlos Mendez', role: 'Junior Developer', stars: 5 }, { quote: "The curriculum is so practical. Every project went straight into my portfolio.", author: 'Amy Foster', role: 'Front-end Developer', stars: 5 }, { quote: "David explains complex concepts in a way that actually makes sense.", author: 'Raj Patel', role: 'Full-Stack Developer', stars: 5 }] }), mk('pricing', 'Enroll Today', { subtitle: 'One-time payment. Lifetime access. 30-day guarantee.', pricingPlans: [{ name: 'Full Course', price: '$497', period: 'one-time', features: ['All 12 modules', 'Lifetime access', '20+ projects', 'Career coaching', 'Discord community', '30-day guarantee'], highlighted: true, buttonText: 'Enroll Now' }, { name: 'Monthly Plan', price: '$97', period: '/month × 6', features: ['Same full access', 'Cancel anytime', 'All projects', 'Community access'], highlighted: false, buttonText: 'Start Monthly' }] }), mk('footer')] }] },
  { id: 'consulting', name: 'Business Consulting', category: 'Website', emoji: '💼', heroColor: 'linear-gradient(135deg,#1e3a5f,#0f172a)', desc: 'Professional consulting homepage with services and lead capture.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { bgColor: '#1e3a5f', textColor: '#ffffff', buttonText: 'Book a Call', buttonColor: '#f59e0b' }), mk('hero', 'Strategic Growth for Market Leaders', { bgGradient: 'linear-gradient(135deg,#1e3a5f,#0f172a)', subheading: 'We help B2B companies scale revenue from $1M to $10M+ through proven go-to-market strategies.', buttonText: 'Book a Free Strategy Call', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mk('stats', '', { bgColor: '#1e3a5f', statItems: [{ value: '300+', label: 'Companies Scaled', icon: '📈' }, { value: '$2B+', label: 'Revenue Generated', icon: '💰' }, { value: '18yr', label: 'Experience', icon: '🏆' }, { value: '94%', label: 'Client Retention', icon: '❤️' }] }), mk('features', 'Our Services', { bgColor: '#f8fafc', featureItems: [{ icon: '🎯', title: 'GTM Strategy', desc: 'Go-to-market playbooks that consistently generate qualified pipeline.' }, { icon: '💰', title: 'Revenue Operations', desc: 'Align sales, marketing and CS to eliminate revenue leakage.' }, { icon: '📊', title: 'Sales Enablement', desc: 'Equip your team to close more deals faster.' }], columns: 3 }), mk('testimonials', 'Trusted by B2B Leaders', { testimonialItems: [{ quote: "Best business decision we made last year. Revenue grew 3x in 8 months.", author: 'Robert Hayes', role: 'CEO, SaaSify', stars: 5 }, { quote: "They identified $2M in untapped revenue in our first workshop.", author: 'Sandra Wu', role: 'VP Sales, DataPlex', stars: 5 }, { quote: "A consultancy that actually gets their hands dirty and delivers results.", author: 'Mark Peterson', role: 'Founder, CloudOps', stars: 5 }] }), mk('form', 'Book Your Free Strategy Call', { bgColor: '#f8fafc', buttonColor: '#1e3a5f', buttonText: 'Book My Free Call →', formFields: [{ label: 'Full Name', type: 'text', required: true }, { label: 'Work Email', type: 'email', required: true }, { label: 'Annual Revenue', type: 'text', required: false }, { label: 'Biggest Challenge', type: 'text', required: false }] }), mk('footer')] }] },
  { id: 'event', name: 'Event / Conference', category: 'Landing', emoji: '🎪', heroColor: 'linear-gradient(135deg,#dc2626,#7f1d1d)', desc: 'Event registration page with countdown and speaker lineup.', pages: [{ name: 'Event', type: 'landing', blocks: [mk('hero', 'SummitConf 2025: The Future of Growth', { bgGradient: 'linear-gradient(135deg,#dc2626,#7f1d1d)', subheading: '📍 San Francisco · June 12-13, 2025 · 2,000 Attendees · 40+ Speakers', buttonText: 'Register Now — Save 30%', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mk('countdown', 'Early Bird Pricing Ends In:', { bgColor: '#f59e0b', textColor: '#0f172a', subheading: 'Lock in your 30% discount before prices increase.' }), mk('features', 'World-Class Speakers', { bgColor: '#f8fafc', featureItems: [{ icon: '🎤', title: 'Jason Reid', desc: 'CEO at HyperScale — "The $100M Revenue Playbook"' }, { icon: '🎤', title: 'Lisa Chen', desc: 'CTO at FutureTech — "AI-Powered Growth Strategies"' }, { icon: '🎤', title: 'Marcus Smith', desc: 'Partner at Peak Ventures — "Fundraising in 2025"' }, { icon: '🎤', title: 'Aisha Johnson', desc: 'CMO at Brand Giant — "Viral Marketing That Lasts"' }, { icon: '🎤', title: 'Tom Parker', desc: 'Founder at 10x Labs — "Building 10x Products"' }, { icon: '🎤', title: 'Nina Roberts', desc: 'VP at SalesForce — "Enterprise Sales in the AI Era"' }] }), mk('pricing', 'Choose Your Pass', { pricingPlans: [{ name: 'General', price: '$497', period: '', features: ['2-day access', 'All keynotes', 'Networking events', 'Recording access'], highlighted: false, buttonText: 'Register' }, { name: 'VIP', price: '$997', period: '', features: ['Everything General', 'VIP dinner', 'Speaker meet & greet', 'Workshop front row', 'VIP lounge'], highlighted: true, buttonText: 'Get VIP Access' }, { name: 'Team (5+)', price: '$2,497', period: '', features: ['5 General passes', 'Team photo', 'Custom booth option', 'Invoice available'], highlighted: false, buttonText: 'Book Team' }] }), mk('form', 'Register Now', { bgColor: '#fff5f5', buttonColor: '#dc2626', buttonText: 'Complete Registration →', formFields: [{ label: 'Full Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Company', type: 'text', required: true }] }), mk('footer')] }] },
  { id: 'portfolio', name: 'Creative Portfolio', category: 'Website', emoji: '✨', heroColor: 'linear-gradient(135deg,#f59e0b,#ec4899)', desc: 'Stunning portfolio for designers, developers, and creatives.', pages: [{ name: 'Portfolio', type: 'landing', blocks: [mk('navbar', '', { navLogo: 'Alex.Design', buttonText: 'Hire Me', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mk('hero', "Hi, I'm Alex Rivera — I Design Experiences That Convert", { bgGradient: 'linear-gradient(135deg,#fbbf24,#f59e0b,#ec4899)', subheading: "Award-winning UX/UI designer with 8 years of experience. Helped 50+ startups ship products users love.", buttonText: 'View My Work', buttonColor: '#0f172a', buttonTextColor: '#ffffff', secondaryButtonText: 'Get in Touch' }), mk('gallery', 'Selected Work', { subtitle: 'A curated selection of my best projects', galleryImages: ['#6366f1', '#f59e0b', '#ec4899', '#0891b2', '#22c55e', '#f97316', '#8b5cf6', '#14b8a6', '#ef4444'], columns: 3 }), mk('features', 'Skills & Expertise', { bgColor: '#ffffff', featureItems: [{ icon: '🎨', title: 'UI Design', desc: 'Pixel-perfect interfaces in Figma with full design systems.' }, { icon: '🧠', title: 'UX Research', desc: 'User interviews, testing, and data-driven decisions.' }, { icon: '💻', title: 'Frontend Dev', desc: 'I code my designs in React for seamless handoff.' }, { icon: '📱', title: 'Mobile Design', desc: 'Native iOS & Android with platform-specific patterns.' }, { icon: '🖼️', title: 'Brand Identity', desc: 'Logos and guidelines that stand out.' }, { icon: '🎬', title: 'Motion Design', desc: 'Micro-interactions that delight users.' }] }), mk('columns', 'About Me', { bgColor: '#fefce8', subheading: "Design is solving problems beautifully. I've spent 8 years doing exactly that for startups and Fortune 500s.", imagePosition: 'left', imageUrl: '#f59e0b', listItems: ['Previously at Figma, Airbnb & Google', '50+ projects shipped for real users', 'Speaker at Config & Awwwards', '25,000+ YouTube design subscribers'] }), mk('testimonials', 'Client Feedback', { testimonialItems: [{ quote: "Alex redesigned our product in 6 weeks. Engagement up 85% and churn dropped 40%.", author: 'Ben Carter', role: 'CEO, AppStartup', stars: 5 }, { quote: "Exceptional talent. Alex understood our users better than we did.", author: 'Sarah Kim', role: 'Product Lead, TechCo', stars: 5 }, { quote: "Best designer I've ever worked with. Fast, communicative, stunning results.", author: 'Marco Rossi', role: 'Founder, DesignApp', stars: 5 }] }), mk('form', "Let's Work Together", { bgColor: '#fefce8', buttonColor: '#f59e0b', buttonTextColor: '#0f172a', buttonText: 'Send Message →', formFields: [{ label: 'Your Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }, { label: 'Project Type', type: 'text', required: false }, { label: 'Tell Me About Your Project', type: 'text', required: true }] }), mk('footer', '', { navLogo: 'Alex.Design' })] }] },
];

const CATALOG: { category: string; icon: string; blocks: { type: BlockType; label: string; emoji: string; color: string }[] }[] = [
  { category: 'Sections', icon: '🏗️', blocks: [{ type: 'hero', label: 'Hero Banner', emoji: '🦸', color: '#6366f1' }, { type: 'features', label: 'Features Grid', emoji: '⚡', color: '#3b82f6' }, { type: 'testimonials', label: 'Testimonials', emoji: '💬', color: '#8b5cf6' }, { type: 'pricing', label: 'Pricing Table', emoji: '💰', color: '#22c55e' }, { type: 'columns', label: '2-Column Split', emoji: '◼◼', color: '#f59e0b' }, { type: 'cta', label: 'CTA Section', emoji: '📣', color: '#ec4899' }, { type: 'stats', label: 'Stats Counter', emoji: '📊', color: '#06b6d4' }, { type: 'faq', label: 'FAQ Accordion', emoji: '❓', color: '#84cc16' }, { type: 'gallery', label: 'Image Gallery', emoji: '🖼️', color: '#f97316' }] },
  { category: 'Navigation', icon: '🧭', blocks: [{ type: 'navbar', label: 'Navigation Bar', emoji: '🔝', color: '#374151' }, { type: 'footer', label: 'Footer', emoji: '🔚', color: '#374151' }] },
  { category: 'Elements', icon: '🔤', blocks: [{ type: 'heading', label: 'Heading', emoji: 'H', color: '#6366f1' }, { type: 'text', label: 'Text Block', emoji: 'T', color: '#64748b' }, { type: 'button', label: 'Button', emoji: '▶', color: '#22c55e' }, { type: 'image', label: 'Image', emoji: '🖼', color: '#f59e0b' }, { type: 'video', label: 'Video', emoji: '▶️', color: '#ef4444' }, { type: 'divider', label: 'Divider', emoji: '—', color: '#94a3b8' }, { type: 'spacer', label: 'Spacer', emoji: '↕', color: '#cbd5e1' }] },
  { category: 'Forms & Tools', icon: '📋', blocks: [{ type: 'form', label: 'Lead Form', emoji: '📋', color: '#6366f1' }, { type: 'countdown', label: 'Countdown Timer', emoji: '⏱', color: '#ef4444' }] },
];

// ─── DROP ZONE ────────────────────────────────────────────────────────────────
function DropZone({ index, active, onOver, onDrop }: { index: number; active: boolean; onOver: (i: number) => void; onDrop: (i: number) => void }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onOver(index); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(index); }}
      style={{ height: active ? 52 : 6, background: active ? '#eff6ff' : 'transparent', borderTop: active ? '2px solid #6366f1' : '2px solid transparent', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {active && <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>Drop here</span>}
    </div>
  );
}

// ─── BLOCK RENDERER ────────────────────────────────────────────────────────────
function BlockRender({ block }: { block: FunnelBlock }) {
  const s = block.settings;
  const bg = s.bgGradient || (s.bgColor ?? 'transparent');
  const pad = `${s.padding ?? 16}px`;

  switch (block.type) {
    case 'navbar': return (
      <nav style={{ background: s.bgColor ?? '#fff', padding: '0 40px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: s.textColor ?? '#0f172a', letterSpacing: '-0.5px' }}>{s.navLogo ?? 'YourBrand'}</div>
        <div style={{ display: 'flex', gap: 28 }}>
          {(s.navLinks ?? []).map((l, i) => <a key={i} href={l.url} style={{ fontSize: 14, color: s.textColor ?? '#374151', textDecoration: 'none', fontWeight: 500 }}>{l.label}</a>)}
        </div>
        {s.buttonText && <button style={{ padding: '9px 20px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{s.buttonText}</button>}
      </nav>
    );

    case 'hero': return (
      <section style={{ background: bg, minHeight: s.minHeight ?? 520, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${s.padding ?? 80}px 40px`, position: 'relative', overflow: 'hidden' }}>
        {s.bgImage && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${s.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
        {s.overlay && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${s.overlayOpacity ?? 0.5})` }} />}
        <div style={{ position: 'relative', textAlign: s.align ?? 'center', maxWidth: 860, width: '100%' }}>
          <h1 style={{ fontSize: 54, fontWeight: 900, color: s.textColor ?? '#fff', lineHeight: 1.1, margin: '0 0 20px', letterSpacing: '-1px' }}>{block.content}</h1>
          {s.subheading && <p style={{ fontSize: 20, color: `${s.textColor ?? '#fff'}cc`, marginBottom: 36, lineHeight: 1.7 }}>{s.subheading}</p>}
          <div style={{ display: 'flex', gap: 14, justifyContent: s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center', flexWrap: 'wrap' }}>
            <button style={{ padding: '15px 34px', background: s.buttonColor ?? '#fff', color: s.buttonTextColor ?? '#6366f1', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>{s.buttonText ?? 'Get Started'}</button>
            {s.secondaryButtonText && <button style={{ padding: '15px 34px', background: 'transparent', color: s.textColor ?? '#fff', border: '2px solid rgba(255,255,255,0.45)', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>{s.secondaryButtonText}</button>}
          </div>
        </div>
      </section>
    );

    case 'features': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: s.align ?? 'center' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 12, letterSpacing: '-0.5px' }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 18, color: '#64748b', marginBottom: 52, lineHeight: 1.7 }}>{s.subtitle}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns ?? 3}, 1fr)`, gap: 24 }}>
            {(s.featureItems ?? []).map((f, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'left', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `${s.iconColor ?? '#6366f1'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8, margin: '0 0 8px' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'testimonials': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 12 }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 18, color: s.textColor ? `${s.textColor}99` : '#64748b', marginBottom: 52 }}>{s.subtitle}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {(s.testimonialItems ?? []).slice(0, 3).map((t, i) => (
              <div key={i} style={{ background: s.bgColor === '#0f172a' ? '#1e293b' : '#f8fafc', borderRadius: 18, padding: 28, textAlign: 'left', border: `1px solid ${s.bgColor === '#0f172a' ? '#334155' : '#e2e8f0'}` }}>
                <div style={{ color: '#f59e0b', marginBottom: 14, fontSize: 18, letterSpacing: 2 }}>{'★'.repeat(t.stars ?? 5)}</div>
                <p style={{ fontSize: 15, color: s.bgColor === '#0f172a' ? '#cbd5e1' : '#374151', lineHeight: 1.8, marginBottom: 20, fontStyle: 'italic' }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: `hsl(${i * 80 + 200},60%,50%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{t.author[0]}</div>
                  <div><div style={{ fontSize: 14, fontWeight: 700, color: s.bgColor === '#0f172a' ? '#f1f5f9' : '#0f172a' }}>{t.author}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{t.role}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'pricing': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 12 }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 18, color: '#64748b', marginBottom: 52 }}>{s.subtitle}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${(s.pricingPlans ?? []).length}, 1fr)`, gap: 24, maxWidth: 1000, margin: '0 auto' }}>
            {(s.pricingPlans ?? []).map((plan, i) => (
              <div key={i} style={{ background: plan.highlighted ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#fff', borderRadius: 22, padding: '36px 28px', border: plan.highlighted ? 'none' : '1px solid #e2e8f0', boxShadow: plan.highlighted ? '0 24px 60px rgba(99,102,241,0.35)' : '0 2px 12px rgba(0,0,0,0.04)', transform: plan.highlighted ? 'scale(1.05)' : 'none' }}>
                {plan.highlighted && <div style={{ fontSize: 12, fontWeight: 700, color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Most Popular</div>}
                <div style={{ fontSize: 16, fontWeight: 700, color: plan.highlighted ? '#e0e7ff' : '#64748b', marginBottom: 8 }}>{plan.name}</div>
                <div style={{ fontSize: 50, fontWeight: 900, color: plan.highlighted ? '#fff' : '#0f172a', lineHeight: 1, marginBottom: 4 }}>{plan.price}</div>
                {plan.period && <div style={{ fontSize: 14, color: plan.highlighted ? '#c7d2fe' : '#94a3b8', marginBottom: 28 }}>{plan.period}</div>}
                <div style={{ borderTop: `1px solid ${plan.highlighted ? '#a5b4fc' : '#e2e8f0'}`, paddingTop: 24, marginBottom: 28 }}>
                  {(plan.features ?? []).map((f, fi) => (
                    <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: plan.highlighted ? 'rgba(255,255,255,0.2)' : '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: plan.highlighted ? '#fff' : '#16a34a', fontWeight: 700, flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 14, color: plan.highlighted ? '#e0e7ff' : '#374151', textAlign: 'left' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button style={{ width: '100%', padding: 14, background: plan.highlighted ? '#fff' : '#6366f1', color: plan.highlighted ? '#6366f1' : '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{plan.buttonText ?? 'Get Started'}</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'columns': {
      const imgSide = (
        <div style={{ borderRadius: 20, overflow: 'hidden', background: s.imageUrl ? undefined : `linear-gradient(135deg,${s.buttonColor ?? '#6366f1'}33,${s.buttonColor ?? '#6366f1'}66)`, minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {s.imageUrl ? <img src={s.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" /> : <span style={{ fontSize: 64, opacity: 0.5 }}>🖼️</span>}
        </div>
      );
      const txtSide = (
        <div>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 16, lineHeight: 1.15, letterSpacing: '-0.5px' }}>{block.content}</h2>
          {s.subheading && <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.8, marginBottom: 24 }}>{s.subheading}</p>}
          {(s.listItems ?? []).map((item, i) => <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#16a34a', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span><span style={{ fontSize: 15, color: '#374151', lineHeight: 1.6 }}>{item}</span></div>)}
          {s.buttonText && <button style={{ marginTop: 12, padding: '13px 28px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText}</button>}
        </div>
      );
      return (
        <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
            {s.imagePosition === 'left' ? <>{imgSide}{txtSide}</> : <>{txtSide}{imgSide}</>}
          </div>
        </section>
      );
    }

    case 'cta': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px`, textAlign: s.align ?? 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 44, fontWeight: 900, color: s.textColor ?? '#fff', marginBottom: 16, lineHeight: 1.1, letterSpacing: '-1px' }}>{block.content}</h2>
          {s.subheading && <p style={{ fontSize: 18, color: `${s.textColor ?? '#fff'}bb`, marginBottom: 36, lineHeight: 1.7 }}>{s.subheading}</p>}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button style={{ padding: '16px 36px', background: s.buttonColor ?? '#fff', color: s.buttonTextColor ?? '#6366f1', border: 'none', borderRadius: 10, fontSize: 17, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>{s.buttonText ?? 'Get Started'}</button>
            {s.secondaryButtonText && <button style={{ padding: '16px 36px', background: 'transparent', color: s.textColor ?? '#fff', border: '2px solid rgba(255,255,255,0.4)', borderRadius: 10, fontSize: 17, fontWeight: 600, cursor: 'pointer' }}>{s.secondaryButtonText}</button>}
          </div>
        </div>
      </section>
    );

    case 'stats': return (
      <section style={{ background: bg, padding: `${s.padding ?? 60}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: `repeat(${(s.statItems ?? []).length}, 1fr)`, gap: 32, textAlign: 'center' }}>
          {(s.statItems ?? []).map((st, i) => (
            <div key={i}>
              {st.icon && <div style={{ fontSize: 32, marginBottom: 10 }}>{st.icon}</div>}
              <div style={{ fontSize: 44, fontWeight: 900, color: s.textColor ?? '#fff', lineHeight: 1 }}>{st.value}</div>
              <div style={{ fontSize: 14, color: s.bgColor === '#0f172a' ? '#94a3b8' : '#64748b', marginTop: 8, fontWeight: 500 }}>{st.label}</div>
            </div>
          ))}
        </div>
      </section>
    );

    case 'faq': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 12, textAlign: s.align ?? 'left' }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 16, color: '#64748b', marginBottom: 40, textAlign: s.align ?? 'left' }}>{s.subtitle}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(s.faqItems ?? []).map((f, i) => (
              <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '18px 22px', background: '#f8fafc', fontWeight: 600, color: '#0f172a', fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {f.q}<span style={{ color: '#6366f1', fontSize: 20, fontWeight: 300, marginLeft: 12 }}>+</span>
                </div>
                <div style={{ padding: '14px 22px', fontSize: 14, color: '#64748b', lineHeight: 1.8, background: '#fff' }}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'gallery': return (
      <section style={{ background: bg, padding: `${s.padding ?? 60}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 10, textAlign: 'center' }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 18, color: '#64748b', marginBottom: 40, textAlign: 'center' }}>{s.subtitle}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns ?? 3}, 1fr)`, gap: 16 }}>
            {(s.galleryImages ?? ['#e0e7ff', '#ddd6fe', '#fce7f3', '#fee2e2', '#d1fae5', '#fef3c7']).map((c, i) => (
              <div key={i} style={{ aspectRatio: '4/3', background: c.startsWith('#') ? c : '#e2e8f0', borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
                {c.startsWith('http') ? <img src={c} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '📷'}
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'footer': return (
      <footer style={{ background: s.bgColor ?? '#0f172a', padding: `${s.padding ?? 60}px 40px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `2fr ${(s.footerColumns ?? []).map(() => '1fr').join(' ')}`, gap: 48, marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 12 }}>{s.navLogo ?? 'YourBrand'}</div>
              <p style={{ fontSize: 14, color: s.textColor ?? '#94a3b8', lineHeight: 1.8, maxWidth: 220 }}>Building the future, one product at a time.</p>
            </div>
            {(s.footerColumns ?? []).map((col, i) => (
              <div key={i}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{col.heading}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(col.links ?? []).map((link, j) => <a key={j} href={link.url} style={{ fontSize: 14, color: s.textColor ?? '#94a3b8', textDecoration: 'none' }}>{link.label}</a>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: '#4b5563' }}>{s.footerCopyright ?? `© ${new Date().getFullYear()} YourBrand Inc.`}</div>
        </div>
      </footer>
    );

    case 'heading': {
      const sz: Record<string, string> = { sm: '20px', md: '28px', lg: '36px', xl: '48px' };
      return <div style={{ padding: pad, textAlign: s.align ?? 'center' }}><h1 style={{ fontSize: sz[s.size ?? 'xl'], fontWeight: Number(s.fontWeight ?? 700), color: s.color ?? '#0f172a', margin: 0, lineHeight: 1.2 }}>{block.content}</h1></div>;
    }
    case 'text': {
      const sz: Record<string, string> = { sm: '13px', md: '15px', lg: '18px', xl: '22px' };
      return <div style={{ padding: pad, textAlign: s.align ?? 'left' }}><p style={{ fontSize: sz[s.size ?? 'md'], color: s.color ?? '#64748b', lineHeight: 1.8, margin: 0 }}>{block.content}</p></div>;
    }
    case 'button': return (
      <div style={{ padding: pad, textAlign: s.align ?? 'center' }}>
        <button style={{ padding: '13px 30px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: s.borderRadius ?? 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>{block.content}</button>
      </div>
    );
    case 'image': return (
      <div style={{ padding: pad, textAlign: s.align ?? 'center' }}>
        {s.imageUrl ? <img src={s.imageUrl} alt={s.imageAlt ?? ''} style={{ maxWidth: '100%', borderRadius: s.borderRadius ?? 0, boxShadow: s.shadow ? '0 8px 32px rgba(0,0,0,0.15)' : 'none' }} /> : <div style={{ background: '#e2e8f0', borderRadius: 12, padding: 60, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#94a3b8', minWidth: 280 }}><span style={{ fontSize: 48 }}>🖼️</span><span style={{ fontSize: 14 }}>Image URL not set</span></div>}
      </div>
    );
    case 'video': return (
      <div style={{ padding: pad }}>
        <div style={{ background: '#0f172a', borderRadius: 14, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', maxWidth: 800, margin: '0 auto' }}>
          {s.url ? <iframe src={s.url} style={{ width: '100%', height: '100%', border: 'none' }} title="video" allow="autoplay" /> : <div style={{ textAlign: 'center', color: '#94a3b8' }}><div style={{ fontSize: 56, marginBottom: 12 }}>▶️</div><div style={{ fontSize: 15 }}>Paste a YouTube or Vimeo embed URL</div></div>}
        </div>
      </div>
    );
    case 'form': return (
      <div style={{ background: bg, padding: `${s.padding ?? 48}px 40px` }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 24, textAlign: 'center' }}>{block.content}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(s.formFields ?? []).map((f, i) => (
              <div key={i}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
                <input type={f.type} placeholder={`Enter your ${f.label.toLowerCase()}`} style={{ width: '100%', padding: '11px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} readOnly />
              </div>
            ))}
          </div>
          <button style={{ width: '100%', marginTop: 20, padding: '14px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText ?? 'Submit'}</button>
        </div>
      </div>
    );
    case 'divider': return <div style={{ padding: `${s.padding ?? 16}px 40px` }}><hr style={{ border: 'none', borderTop: `1px solid ${s.color ?? '#e2e8f0'}`, margin: 0 }} /></div>;
    case 'spacer': return <div style={{ height: s.padding ?? 60 }} />;
    case 'countdown': return (
      <section style={{ background: bg, padding: `${s.padding ?? 60}px 40px`, textAlign: s.align ?? 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: s.textColor ?? '#fff', marginBottom: 8 }}>{block.content}</h2>
        {s.subheading && <p style={{ fontSize: 15, color: `${s.textColor ?? '#fff'}aa`, marginBottom: 32 }}>{s.subheading}</p>}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['14', '23', '47', '12'].map((n, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '18px 24px', minWidth: 80, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: s.textColor ?? '#fff', lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 12, color: `${s.textColor ?? '#fff'}99`, marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{['Days', 'Hours', 'Mins', 'Secs'][i]}</div>
            </div>
          ))}
        </div>
      </section>
    );
    default: return <div style={{ padding: 20, background: '#f8fafc', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Block: {block.type}</div>;
  }
}

interface CanvasBlockProps {
  block: FunnelBlock; selected: boolean; preview: boolean;
  onClick: () => void; onDragStart: () => void; isDragging: boolean;
  onDelete: () => void; onDuplicate: () => void; onMoveUp: () => void; onMoveDown: () => void;
}
function CanvasBlock({ block, selected, preview, onClick, onDragStart, isDragging, onDelete, onDuplicate, onMoveUp, onMoveDown }: CanvasBlockProps) {
  return (
    <div
      draggable={!preview}
      onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
      onClick={(e) => { e.stopPropagation(); if (!preview) onClick(); }}
      style={{ position: 'relative', opacity: isDragging ? 0.35 : 1, outline: selected && !preview ? '2px solid #6366f1' : '2px solid transparent', outlineOffset: -2, cursor: preview ? 'default' : 'pointer', transition: 'opacity 0.15s' }}
    >
      <BlockRender block={block} />
      {selected && !preview && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 20 }}>
          {[
            { icon: '↑', title: 'Move Up', action: onMoveUp },
            { icon: '↓', title: 'Move Down', action: onMoveDown },
            { icon: '⧉', title: 'Duplicate', action: onDuplicate },
            { icon: '🗑', title: 'Delete', action: onDelete },
          ].map(btn => (
            <button key={btn.title} title={btn.title} onClick={(e) => { e.stopPropagation(); btn.action(); }}
              style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: btn.title === 'Delete' ? '#ef4444' : '#0f172a', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
              {btn.icon}
            </button>
          ))}
        </div>
      )}
      {selected && !preview && (
        <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: '#6366f1', color: '#fff', borderRadius: 6, padding: '4px 6px', fontSize: 11, fontWeight: 700, zIndex: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>{block.type}</div>
      )}
    </div>
  );
}

// ─── PropertiesPanel ──────────────────────────────────────────────────────────
interface PropPanelProps {
  block: FunnelBlock;
  onChange: (updated: FunnelBlock) => void;
}
function PropertiesPanel({ block, onChange }: PropPanelProps) {
  const s = block.settings;
  function set(patch: Partial<FunnelBlock['settings']>) {
    onChange({ ...block, settings: { ...s, ...patch } });
  }
  function setContent(content: string) {
    onChange({ ...block, content });
  }

  const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
  const label: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 };
  const input: CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff', boxSizing: 'border-box' };
  const sel: CSSProperties = { ...input };
  const section: CSSProperties = { borderBottom: '1px solid #f1f5f9', paddingBottom: 14, marginBottom: 14 };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 16, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>{block.type} Settings</div>

      {/* Common: content */}
      {!['features','testimonials','pricing','stats','faq','gallery','navbar','footer','hero','columns'].includes(block.type) && (
        <div style={section}>
          <div style={row}>
            <span style={label}>Content / Text</span>
            <textarea value={block.content} onChange={e => setContent(e.target.value)}
              style={{ ...input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>
      )}

      {/* Alignment */}
      {['heading','text','button','cta','stats','countdown'].includes(block.type) && (
        <div style={row}>
          <span style={label}>Align</span>
          <select value={s.align ?? 'center'} onChange={e => set({ align: e.target.value as 'left'|'center'|'right' })} style={sel}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      )}

      {/* Colors */}
      <div style={section}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {['hero','heading','text','button','cta','features','testimonials','pricing','stats','faq','countdown','columns'].includes(block.type) && (
            <div style={row}>
              <span style={label}>Text Color</span>
              <input type="color" value={s.textColor ?? '#1e293b'} onChange={e => set({ textColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} />
            </div>
          )}
          <div style={row}>
            <span style={label}>Bg Color</span>
            <input type="color" value={s.bgColor ?? '#ffffff'} onChange={e => set({ bgColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} />
          </div>
        </div>
        <div style={row}>
          <span style={label}>Bg Gradient (CSS)</span>
          <input value={s.bgGradient ?? ''} onChange={e => set({ bgGradient: e.target.value })}
            placeholder="linear-gradient(135deg, #667eea, #764ba2)" style={input} />
        </div>
        <div style={row}>
          <span style={label}>Bg Image URL</span>
          <input value={s.bgImage ?? ''} onChange={e => set({ bgImage: e.target.value })}
            placeholder="https://..." style={input} />
        </div>
        {s.bgImage && (
          <div style={row}>
            <span style={label}>Overlay opacity</span>
            <input type="range" min={0} max={1} step={0.05} value={s.overlayOpacity ?? 0.5}
              onChange={e => set({ overlayOpacity: parseFloat(e.target.value) })} style={{ width: '100%' }} />
          </div>
        )}
      </div>

      {/* Padding / spacing */}
      <div style={section}>
        <div style={row}>
          <span style={label}>Padding (px)</span>
          <input type="number" value={s.padding ?? 40} onChange={e => set({ padding: parseInt(e.target.value) })} style={input} />
        </div>
      </div>

      {/* Button specific */}
      {['button','hero','cta'].includes(block.type) && (
        <div style={section}>
          <div style={row}><span style={label}>Button Text</span><input value={s.buttonText ?? ''} onChange={e => set({ buttonText: e.target.value })} style={input} /></div>
          <div style={row}><span style={label}>Button URL</span><input value={s.url ?? ''} onChange={e => set({ url: e.target.value })} style={input} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={row}><span style={label}>Btn Color</span><input type="color" value={s.buttonColor ?? '#6366f1'} onChange={e => set({ buttonColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} /></div>
            <div style={row}><span style={label}>Btn Text</span><input type="color" value={s.buttonTextColor ?? '#ffffff'} onChange={e => set({ buttonTextColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} /></div>
          </div>
          {['hero','cta'].includes(block.type) && (
            <>
              <div style={row}><span style={label}>Secondary Button Text</span><input value={s.secondaryButtonText ?? ''} onChange={e => set({ secondaryButtonText: e.target.value })} style={input} /></div>
              <div style={row}><span style={label}>Secondary Button URL</span><input value={s.secondaryButtonUrl ?? ''} onChange={e => set({ secondaryButtonUrl: e.target.value })} style={input} /></div>
            </>
          )}
        </div>
      )}

      {/* Image */}
      {['image','hero'].includes(block.type) && (
        <div style={section}>
          <div style={row}><span style={label}>Image URL</span><input value={s.imageUrl ?? ''} onChange={e => set({ imageUrl: e.target.value })} placeholder="https://..." style={input} /></div>
          <div style={row}><span style={label}>Alt Text</span><input value={s.imageAlt ?? ''} onChange={e => set({ imageAlt: e.target.value })} style={input} /></div>
        </div>
      )}

      {/* Video */}
      {block.type === 'video' && (
        <div style={section}>
          <div style={row}><span style={label}>Video URL (YouTube/Vimeo embed)</span><input value={s.url ?? ''} onChange={e => set({ url: e.target.value })} placeholder="https://youtube.com/embed/..." style={input} /></div>
        </div>
      )}

      {/* Form fields */}
      {block.type === 'form' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Form Fields</div>
          {(s.formFields ?? []).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Field {i+1}</span>
                <button onClick={() => { const ff = [...(s.formFields??[])]; ff.splice(i,1); set({ formFields: ff }); }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>Remove</button>
              </div>
              <input value={f.label} onChange={e => { const ff = [...(s.formFields??[])]; ff[i] = {...ff[i], label: e.target.value}; set({ formFields: ff }); }}
                placeholder="Label" style={{ ...input, marginBottom: 4 }} />
              <select value={f.type} onChange={e => { const ff = [...(s.formFields??[])]; ff[i] = {...ff[i], type: e.target.value}; set({ formFields: ff }); }} style={sel}>
                {['text','email','phone','number','textarea','select'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
          <button onClick={() => set({ formFields: [...(s.formFields??[]), { label: 'Field', type: 'text', required: false }] })}
            style={{ width: '100%', padding: '7px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Field</button>
        </div>
      )}

      {/* Feature items */}
      {block.type === 'features' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Feature Items</div>
          {(s.featureItems ?? []).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Item {i+1}</span>
                <button onClick={() => { const fi = [...(s.featureItems??[])]; fi.splice(i,1); set({ featureItems: fi }); }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>Remove</button>
              </div>
              <input value={f.icon} onChange={e => { const fi = [...(s.featureItems??[])]; fi[i]={...fi[i],icon:e.target.value}; set({featureItems:fi}); }} placeholder="Icon (emoji)" style={{ ...input, marginBottom: 4 }} />
              <input value={f.title} onChange={e => { const fi = [...(s.featureItems??[])]; fi[i]={...fi[i],title:e.target.value}; set({featureItems:fi}); }} placeholder="Title" style={{ ...input, marginBottom: 4 }} />
              <input value={f.desc} onChange={e => { const fi = [...(s.featureItems??[])]; fi[i]={...fi[i],desc:e.target.value}; set({featureItems:fi}); }} placeholder="Description" style={input} />
            </div>
          ))}
          <button onClick={() => set({ featureItems: [...(s.featureItems??[]), { icon: '⭐', title: 'Feature', desc: 'Description' }] })}
            style={{ width: '100%', padding: '7px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Feature</button>
        </div>
      )}

      {/* Testimonials */}
      {block.type === 'testimonials' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Testimonials</div>
          {(s.testimonialItems ?? []).map((t, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>#{i+1}</span>
                <button onClick={() => { const ti=[...(s.testimonialItems??[])]; ti.splice(i,1); set({testimonialItems:ti}); }}
                  style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer' }}>Remove</button>
              </div>
              <textarea value={t.quote} onChange={e => { const ti=[...(s.testimonialItems??[])]; ti[i]={...ti[i],quote:e.target.value}; set({testimonialItems:ti}); }} placeholder="Quote" style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit', marginBottom: 4 }} />
              <input value={t.author} onChange={e => { const ti=[...(s.testimonialItems??[])]; ti[i]={...ti[i],author:e.target.value}; set({testimonialItems:ti}); }} placeholder="Author" style={{ ...input, marginBottom: 4 }} />
              <input value={t.role} onChange={e => { const ti=[...(s.testimonialItems??[])]; ti[i]={...ti[i],role:e.target.value}; set({testimonialItems:ti}); }} placeholder="Role / Company" style={input} />
            </div>
          ))}
          <button onClick={() => set({ testimonialItems: [...(s.testimonialItems??[]), { quote: 'Great product!', author: 'Jane Doe', role: 'CEO', stars: 5 }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Testimonial</button>
        </div>
      )}

      {/* Pricing plans */}
      {block.type === 'pricing' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Pricing Plans</div>
          {(s.pricingPlans ?? []).map((p, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Plan {i+1}</span>
                <button onClick={() => { const pp=[...(s.pricingPlans??[])]; pp.splice(i,1); set({pricingPlans:pp}); }}
                  style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer' }}>Remove</button>
              </div>
              <input value={p.name} onChange={e => { const pp=[...(s.pricingPlans??[])]; pp[i]={...pp[i],name:e.target.value}; set({pricingPlans:pp}); }} placeholder="Plan name" style={{ ...input, marginBottom: 4 }} />
              <input value={p.price} onChange={e => { const pp=[...(s.pricingPlans??[])]; pp[i]={...pp[i],price:e.target.value}; set({pricingPlans:pp}); }} placeholder="Price e.g. $29" style={{ ...input, marginBottom: 4 }} />
              <input value={p.period} onChange={e => { const pp=[...(s.pricingPlans??[])]; pp[i]={...pp[i],period:e.target.value}; set({pricingPlans:pp}); }} placeholder="Period e.g. /month" style={{ ...input, marginBottom: 4 }} />
              <textarea value={(p.features ?? []).join('\n')} onChange={e => { const pp=[...(s.pricingPlans??[])]; pp[i]={...pp[i],features:e.target.value.split('\n')}; set({pricingPlans:pp}); }} placeholder="Features (one per line)" style={{ ...input, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          ))}
          <button onClick={() => set({ pricingPlans: [...(s.pricingPlans??[]), { name: 'New Plan', price: '$0', period: '/mo', features: ['Feature 1'] }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Plan</button>
        </div>
      )}

      {/* FAQ */}
      {block.type === 'faq' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>FAQ Items</div>
          {(s.faqItems ?? []).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Q{i+1}</span>
                <button onClick={() => { const fi=[...(s.faqItems??[])]; fi.splice(i,1); set({faqItems:fi}); }}
                  style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer' }}>Remove</button>
              </div>
              <input value={f.q} onChange={e => { const fi=[...(s.faqItems??[])]; fi[i]={...fi[i],q:e.target.value}; set({faqItems:fi}); }} placeholder="Question" style={{ ...input, marginBottom: 4 }} />
              <textarea value={f.a} onChange={e => { const fi=[...(s.faqItems??[])]; fi[i]={...fi[i],a:e.target.value}; set({faqItems:fi}); }} placeholder="Answer" style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          ))}
          <button onClick={() => set({ faqItems: [...(s.faqItems??[]), { q: 'Question?', a: 'Answer.' }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add FAQ</button>
        </div>
      )}

      {/* Stat items */}
      {block.type === 'stats' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Stat Items</div>
          {(s.statItems ?? []).map((st, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Stat {i+1}</span>
                <button onClick={() => { const si=[...(s.statItems??[])]; si.splice(i,1); set({statItems:si}); }}
                  style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer' }}>Remove</button>
              </div>
              <input value={st.value} onChange={e => { const si=[...(s.statItems??[])]; si[i]={...si[i],value:e.target.value}; set({statItems:si}); }} placeholder="Value e.g. 10K+" style={{ ...input, marginBottom: 4 }} />
              <input value={st.label} onChange={e => { const si=[...(s.statItems??[])]; si[i]={...si[i],label:e.target.value}; set({statItems:si}); }} placeholder="Label e.g. Users" style={input} />
            </div>
          ))}
          <button onClick={() => set({ statItems: [...(s.statItems??[]), { value: '0', label: 'Stat' }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Stat</button>
        </div>
      )}

      {/* Navbar */}
      {block.type === 'navbar' && (
        <div style={section}>
          <div style={row}><span style={label}>Logo Text</span><input value={s.navLogo ?? ''} onChange={e => set({ navLogo: e.target.value })} style={input} /></div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Nav Links</div>
          {(s.navLinks ?? []).map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={l.label} onChange={e => { const nl=[...(s.navLinks??[])]; nl[i]={...nl[i],label:e.target.value}; set({navLinks:nl}); }} placeholder="Label" style={{ ...input, flex: 1 }} />
              <input value={l.url} onChange={e => { const nl=[...(s.navLinks??[])]; nl[i]={...nl[i],url:e.target.value}; set({navLinks:nl}); }} placeholder="URL" style={{ ...input, flex: 1 }} />
              <button onClick={() => { const nl=[...(s.navLinks??[])]; nl.splice(i,1); set({navLinks:nl}); }}
                style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'0 6px',fontSize:11,cursor:'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => set({ navLinks: [...(s.navLinks??[]), { label: 'Link', url: '#' }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Link</button>
        </div>
      )}

      {/* Gallery images */}
      {block.type === 'gallery' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Gallery Images (URLs)</div>
          {(s.galleryImages ?? []).map((url, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={url} onChange={e => { const gi=[...(s.galleryImages??[])]; gi[i]=e.target.value; set({galleryImages:gi}); }} placeholder="https://..." style={{ ...input, flex: 1 }} />
              <button onClick={() => { const gi=[...(s.galleryImages??[])]; gi.splice(i,1); set({galleryImages:gi}); }}
                style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'0 6px',fontSize:11,cursor:'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => set({ galleryImages: [...(s.galleryImages??[]), ''] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Image</button>
        </div>
      )}
    </div>
  );
}

// ─── Main FunnelBuilder ───────────────────────────────────────────────────────
interface FunnelBuilderProps {
  funnel: Funnel;
  onSave: (funnel: Funnel) => void;
  onClose: () => void;
}

export default function FunnelBuilder({ funnel, onSave, onClose }: FunnelBuilderProps) {
  const [pages, setPages] = useState<FunnelStep[]>(
    funnel.pages && funnel.pages.length > 0 ? funnel.pages : [mkPage('Home')]
  );
  const [activePageId, setActivePageId] = useState(pages[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [leftTab, setLeftTab] = useState<'elements' | 'templates' | 'pages'>('elements');
  const [showTemplates, setShowTemplates] = useState(false);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  const activePage = pages.find(p => p.id === activePageId) ?? pages[0];
  const blocks = activePage.blocks;

  function updateBlocks(newBlocks: FunnelBlock[]) {
    setPages(prev => prev.map(p => p.id === activePage.id ? { ...p, blocks: newBlocks } : p));
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function handleDrop(index: number) {
    if (DRAG_TYPE === 'new') {
      const newBlock = createBlock(DRAG_PAYLOAD as FunnelBlock['type']);
      const next = [...blocks];
      next.splice(index, 0, newBlock);
      updateBlocks(next);
      setSelectedId(newBlock.id);
    } else if (DRAG_TYPE === 'move' && draggingId) {
      const from = blocks.findIndex(b => b.id === draggingId);
      if (from < 0) return;
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      const insertAt = index > from ? index - 1 : index;
      next.splice(insertAt, 0, moved);
      updateBlocks(next);
    }
    setDropTarget(null);
    setDraggingId(null);
    DRAG_TYPE = null;
    DRAG_PAYLOAD = '';
  }

  function handleBlockUpdate(updated: FunnelBlock) {
    updateBlocks(blocks.map(b => b.id === updated.id ? updated : b));
  }

  function handleDelete(id: string) {
    updateBlocks(blocks.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleDuplicate(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const copy = { ...blocks[idx], id: uid() };
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    updateBlocks(next);
    setSelectedId(copy.id);
  }

  function handleMoveUp(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx <= 0) return;
    const next = [...blocks];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    updateBlocks(next);
  }

  function handleMoveDown(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0 || idx >= blocks.length - 1) return;
    const next = [...blocks];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    updateBlocks(next);
  }

  // ── Page management ────────────────────────────────────────────────────────
  function addPage() {
    const p = mkPage(`Page ${pages.length + 1}`, 'custom');
    setPages(prev => [...prev, p]);
    setActivePageId(p.id);
  }

  function deletePage(id: string) {
    if (pages.length <= 1) return;
    const next = pages.filter(p => p.id !== id);
    setPages(next);
    if (activePageId === id) setActivePageId(next[0].id);
  }

  function applyTemplate(t: typeof TEMPLATES[0]) {
    const tpage = t.pages[0];
    const p = mkPage(tpage.name, tpage.type);
    p.blocks = tpage.blocks.map(b => ({ ...b, id: uid() }));
    setPages(prev => prev.map(pg => pg.id === activePage.id ? p : pg));
    setSelectedId(null);
  }

  function handleSave() {
    onSave({ ...funnel, pages, steps: pages.length });
  }

  const deviceWidth = device === 'desktop' ? '100%' : device === 'tablet' ? 768 : 375;
  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  // ── Styles ────────────────────────────────────────────────────────────────
  const toolbarBtn = (active?: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 6, border: active ? '2px solid #6366f1' : '1px solid #e2e8f0',
    background: active ? '#eef2ff' : '#fff', color: active ? '#4f46e5' : '#475569',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ── Toolbar ── */}
      <div style={{ height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
        <button onClick={onClose} style={{ ...toolbarBtn(), background: 'transparent', border: '1px solid #334155', color: '#94a3b8' }}>← Back</button>
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{funnel.name}</span>
        <div style={{ flex: 1 }} />
        {/* Device toggles */}
        {(['desktop','tablet','mobile'] as const).map(d => (
          <button key={d} onClick={() => setDevice(d)} style={{ ...toolbarBtn(device === d), background: device === d ? '#1e293b' : 'transparent', border: device === d ? '1px solid #6366f1' : '1px solid #334155', color: device === d ? '#a5b4fc' : '#94a3b8' }}>
            {d === 'desktop' ? '🖥' : d === 'tablet' ? '📱' : '📲'} {d}
          </button>
        ))}
        <button onClick={() => { setPreview(p => !p); setSelectedId(null); }} style={{ ...toolbarBtn(preview), background: preview ? '#1e293b' : 'transparent', border: preview ? '1px solid #6366f1' : '1px solid #334155', color: preview ? '#a5b4fc' : '#94a3b8' }}>
          {preview ? '✏️ Edit' : '👁 Preview'}
        </button>
        <button onClick={handleSave} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Left panel ── */}
        {!preview && (
          <div style={{ width: 240, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              {(['elements','templates','pages'] as const).map(tab => (
                <button key={tab} onClick={() => setLeftTab(tab)}
                  style={{ flex: 1, padding: '10px 4px', border: 'none', background: 'transparent', fontSize: 11, fontWeight: leftTab === tab ? 700 : 500, color: leftTab === tab ? '#6366f1' : '#64748b', cursor: 'pointer', borderBottom: leftTab === tab ? '2px solid #6366f1' : '2px solid transparent', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {tab}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Elements tab */}
              {leftTab === 'elements' && (
                <div style={{ padding: 10 }}>
                  {CATALOG.map(cat => (
                    <div key={cat.category} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6, paddingLeft: 2 }}>{cat.category}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        {cat.blocks.map(item => (
                          <div key={item.type}
                            draggable
                            onDragStart={() => { DRAG_TYPE = 'new'; DRAG_PAYLOAD = item.type; }}
                            onDragEnd={() => { if (DRAG_TYPE === 'new') { DRAG_TYPE = null; DRAG_PAYLOAD = ''; setDropTarget(null); } }}
                            onClick={() => { const b = createBlock(item.type); updateBlocks([...blocks, b]); setSelectedId(b.id); }}
                            style={{ padding: '10px 6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'grab', textAlign: 'center', fontSize: 11, color: '#475569', transition: 'all 0.15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#eef2ff'; (e.currentTarget as HTMLDivElement).style.borderColor = '#a5b4fc'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; }}>
                            <div style={{ fontSize: 18, marginBottom: 3 }}>{item.emoji}</div>
                            <div style={{ fontWeight: 600 }}>{item.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Templates tab */}
              {leftTab === 'templates' && (
                <div style={{ padding: 10 }}>
                  <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>Choose a template to replace the current page.</p>
                  {TEMPLATES.map(t => (
                    <div key={t.name} onClick={() => applyTemplate(t)}
                      style={{ marginBottom: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px #e0e7ff'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}>
                      <div style={{ height: 72, background: t.heroColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 24 }}>{t.emoji}</span>
                      </div>
                      <div style={{ padding: '8px 10px', background: '#fff' }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{t.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pages tab */}
              {leftTab === 'pages' && (
                <div style={{ padding: 10 }}>
                  {pages.map(p => (
                    <div key={p.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: p.id === activePageId ? '#eef2ff' : '#f8fafc', border: p.id === activePageId ? '1px solid #a5b4fc' : '1px solid #e2e8f0', cursor: 'pointer' }}
                      onClick={() => { setActivePageId(p.id); setSelectedId(null); }}>
                      {renamingPageId === p.id ? (
                        <input autoFocus value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => { setPages(prev => prev.map(pg => pg.id === p.id ? { ...pg, name: renameVal || pg.name } : pg)); setRenamingPageId(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { setPages(prev => prev.map(pg => pg.id === p.id ? { ...pg, name: renameVal || pg.name } : pg)); setRenamingPageId(null); } }}
                          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, outline: 'none', color: '#0f172a' }} />
                      ) : (
                        <span style={{ flex: 1, fontSize: 12, fontWeight: p.id === activePageId ? 700 : 500, color: p.id === activePageId ? '#4f46e5' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      )}
                      <button title="Rename" onClick={e => { e.stopPropagation(); setRenamingPageId(p.id); setRenameVal(p.name); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 2px', color: '#94a3b8' }}>✏️</button>
                      {pages.length > 1 && (
                        <button title="Delete" onClick={e => { e.stopPropagation(); deletePage(p.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 2px', color: '#f87171' }}>🗑</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPage}
                    style={{ width: '100%', marginTop: 8, padding: '8px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Page</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Canvas ── */}
        <div
          ref={canvasRef}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (blocks.length === 0) { handleDrop(0); } }}
          onClick={() => setSelectedId(null)}
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: preview ? 0 : '16px 24px', background: '#e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div style={{ width: typeof deviceWidth === 'number' ? deviceWidth : '100%', maxWidth: '100%', background: '#fff', minHeight: '100%', boxShadow: preview ? 'none' : '0 4px 24px rgba(0,0,0,0.10)', borderRadius: preview ? 0 : 8, overflow: 'hidden' }}>
            {/* Drop zone before first block */}
            {!preview && (
              <DropZone index={0} active={dropTarget === 0}
                onOver={i => setDropTarget(i)}
                onDrop={handleDrop} />
            )}
            {blocks.length === 0 && !preview && (
              <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎨</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#475569' }}>Start Building</div>
                <div style={{ fontSize: 14 }}>Drag elements from the left panel or click them to add</div>
              </div>
            )}
            {blocks.map((block, idx) => (
              <Fragment key={block.id}>
                <CanvasBlock
                  block={block}
                  selected={selectedId === block.id}
                  preview={preview}
                  isDragging={draggingId === block.id}
                  onClick={() => setSelectedId(block.id)}
                  onDragStart={() => { DRAG_TYPE = 'move'; DRAG_PAYLOAD = block.id; setDraggingId(block.id); }}
                  onDelete={() => handleDelete(block.id)}
                  onDuplicate={() => handleDuplicate(block.id)}
                  onMoveUp={() => handleMoveUp(block.id)}
                  onMoveDown={() => handleMoveDown(block.id)}
                />
                {!preview && (
                  <DropZone index={idx + 1} active={dropTarget === idx + 1}
                    onOver={i => setDropTarget(i)}
                    onDrop={handleDrop} />
                )}
              </Fragment>
            ))}
          </div>
        </div>

        {/* ── Properties panel ── */}
        {!preview && selectedBlock && (
          <div style={{ width: 280, background: '#fff', borderLeft: '1px solid #e2e8f0', flexShrink: 0, overflowY: 'auto' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>Properties</span>
              <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <PropertiesPanel block={selectedBlock} onChange={handleBlockUpdate} />
          </div>
        )}
        {!preview && !selectedBlock && (
          <div style={{ width: 280, background: '#fff', borderLeft: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#94a3b8', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🖱</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#475569' }}>No block selected</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>Click a block on the canvas to edit its properties</div>
          </div>
        )}
      </div>
    </div>
  );
}
