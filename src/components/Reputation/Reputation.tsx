import React, { useState } from 'react';
import { Star, MessageSquare, ThumbsUp, Send, TrendingUp, AlertCircle } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';

const platformColors: Record<string, { color: string; bg: string }> = {
  google: { color: '#ea4335', bg: '#fef2f2' },
  facebook: { color: '#1877f2', bg: '#eff6ff' },
  yelp: { color: '#d32323', bg: '#fef2f2' },
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '14px',
  border: '1px solid #e6e9f0',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
};

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} size={size} fill={s <= rating ? '#f59e0b' : 'none'} color={s <= rating ? '#f59e0b' : '#e2e8f0'} />
      ))}
    </div>
  );
}

export default function Reputation() {
  const { reviews, addNotification, replyToReview } = useApp();
  const [reply, setReply] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('all');

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '0.0';
  const platformStats = ['google', 'facebook', 'yelp'].map(p => ({
    platform: p,
    count: reviews.filter(r => r.platform === p).length,
    avg: reviews.filter(r => r.platform === p).reduce((s, r) => s + r.rating, 0) / (reviews.filter(r => r.platform === p).length || 1),
  }));

  const filtered = filter === 'all' ? reviews : reviews.filter(r => r.platform === filter || (filter === 'unreplied' && !r.replied));

  const sendReply = (id: string) => {
    if (reply[id]?.trim()) {
      replyToReview(id, reply[id]);
      setReply(prev => ({ ...prev, [id]: '' }));
    }
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100%' }}>
      <Header title="Reputation Management" subtitle="Monitor and respond to customer reviews" />
      <div style={{ padding: '28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ ...cardStyle, padding: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, margin: '0 0 8px' }}>Overall Rating</p>
            <p style={{ fontSize: '34px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 8px' }}>{avgRating}</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <StarRating rating={Math.round(parseFloat(avgRating))} size={18} />
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '8px 0 0' }}>{reviews.length} total reviews</p>
          </div>
          {platformStats.map(ps => {
            const pc = platformColors[ps.platform];
            return (
              <div key={ps.platform} style={{ ...cardStyle, padding: '20px', textAlign: 'center' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: pc.bg, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: pc.color, fontWeight: 700, fontSize: '15px' }}>{ps.platform[0].toUpperCase()}</span>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, margin: '0 0 4px', textTransform: 'capitalize' }}>{ps.platform}</p>
                <p style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 4px' }}>{ps.avg.toFixed(1)}</p>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{ps.count} reviews</p>
              </div>
            );
          })}
        </div>

        <div style={{ ...cardStyle, padding: '20px 24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Rating Distribution</h3>
          {[5, 4, 3, 2, 1].map(star => {
            const count = reviews.filter(r => r.rating === star).length;
            const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
            return (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '50px' }}>
                  <span style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>{star}</span>
                  <Star size={12} fill="#f59e0b" color="#f59e0b" />
                </div>
                <div style={{ flex: 1, height: '8px', backgroundColor: '#f1f5f9', borderRadius: '999px' }}>
                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#f59e0b', borderRadius: '999px' }} />
                </div>
                <span style={{ fontSize: '12px', color: '#94a3b8', minWidth: '34px', textAlign: 'right', fontWeight: 500 }}>{pct}%</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '4px', padding: '4px', backgroundColor: 'white', border: '1px solid #e6e9f0', borderRadius: '10px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            {['all', 'google', 'facebook', 'yelp', 'unreplied'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', backgroundColor: filter === f ? '#eef2ff' : 'transparent', color: filter === f ? '#6366f1' : '#94a3b8', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.12s' }}>
                {f === 'unreplied' ? 'Needs Reply' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(99,102,241,0.35)' }}>
            <Send size={14} /> Request Reviews
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filtered.map(review => {
            const pc = platformColors[review.platform];
            return (
              <div key={review.id} style={{ ...cardStyle, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>
                      {review.author[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '0 0 3px' }}>{review.author}</p>
                      <StarRating rating={review.rating} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, backgroundColor: pc.bg, color: pc.color, textTransform: 'capitalize' }}>
                      {review.platform}
                    </span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{review.date}</span>
                    {!review.replied && (
                      <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', backgroundColor: '#fef3c7', color: '#d97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={10} /> Needs Reply
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.65', marginTop: 0, marginBottom: '14px' }}>{review.content}</p>
                {review.replied ? (
                  <div style={{ padding: '12px 16px', backgroundColor: '#f6f7ff', borderRadius: '10px', border: '1px solid #e0e7ff' }}>
                    <p style={{ fontSize: '12px', color: '#6366f1', fontWeight: 600, margin: '0 0 4px' }}>Your Reply</p>
                    <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: 0 }}>Thank you for your wonderful review! We're thrilled you had such a great experience with us.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      placeholder="Write a reply..."
                      value={reply[review.id] || ''}
                      onChange={e => setReply(prev => ({ ...prev, [review.id]: e.target.value }))}
                      style={{ flex: 1, padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', color: '#475569', backgroundColor: '#f8fafc' }}
                    />
                    <button onClick={() => sendReply(review.id)} style={{ padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <Send size={14} /> Reply
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
