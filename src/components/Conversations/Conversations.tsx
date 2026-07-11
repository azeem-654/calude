import React, { useState } from 'react';
import { MessageSquare, Search, Send, Phone, Mail, MessageCircle, Circle } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';

const channelIcons: Record<string, React.ReactElement> = {
  sms: <MessageCircle size={14} />,
  email: <Mail size={14} />,
  call: <Phone size={14} />,
  chat: <MessageSquare size={14} />,
};

const channelColors: Record<string, string> = {
  sms: '#17191c', email: '#3b82f6', call: '#22c55e', chat: '#f59e0b',
};

export default function Conversations() {
  const { conversations, sendMessage } = useApp();
  const [selected, setSelected] = useState(conversations[0]?.id || '');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  const filtered = conversations.filter(c => c.contactName.toLowerCase().includes(search.toLowerCase()));
  const activeConvo = conversations.find(c => c.id === selected);

  const handleSend = () => {
    if (!message.trim() || !selected) return;
    sendMessage(selected, message);
    setMessage('');
  };

  return (
    <div>
      <Header title="Conversations" subtitle="Manage all your customer conversations" />
      <div style={{ display: 'flex', height: 'calc(100vh - 73px)' }}>
        <div style={{ width: '320px', borderRight: '1px solid #e2e8f0', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                placeholder="Search conversations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '30px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map(conv => (
              <div
                key={conv.id}
                onClick={() => setSelected(conv.id)}
                style={{
                  padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                  backgroundColor: selected === conv.id ? '#f0f4ff' : 'white',
                  borderLeft: selected === conv.id ? '3px solid #17191c' : '3px solid transparent',
                  transition: 'all 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 600 }}>
                      {conv.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: '16px', height: '16px', borderRadius: '50%', backgroundColor: channelColors[conv.channel], display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white', color: 'white' }}>
                      {channelIcons[conv.channel]}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{conv.contactName}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{conv.lastMessageTime}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.lastMessage}</p>
                  </div>
                  {conv.unread > 0 && (
                    <span style={{ minWidth: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#17191c', color: 'white', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
          {activeConvo ? (
            <>
              <div style={{ padding: '16px 24px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: 600 }}>
                    {activeConvo.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{activeConvo.contactName}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Circle size={8} fill="#22c55e" color="#22c55e" />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>via {activeConvo.channel.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[Phone, Mail, MessageCircle].map((Icon, i) => (
                    <button key={i} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Icon size={16} color="#64748b" />
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeConvo.messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender === 'agent' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px', borderRadius: msg.sender === 'agent' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      backgroundColor: msg.sender === 'agent' ? '#17191c' : 'white',
                      color: msg.sender === 'agent' ? 'white' : '#374151',
                      fontSize: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      border: msg.sender === 'contact' ? '1px solid #e2e8f0' : 'none',
                    }}>
                      <p style={{ margin: 0 }}>{msg.content}</p>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', opacity: 0.7, textAlign: 'right' }}>{msg.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '16px 24px', backgroundColor: 'white', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <textarea
                    placeholder="Type your message..."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    rows={2}
                    style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none', resize: 'none', color: '#374151', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={handleSend}
                    style={{ padding: '10px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}
                  >
                    <Send size={16} /> Send
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>Press Enter to send, Shift+Enter for new line</p>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
              <MessageSquare size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
