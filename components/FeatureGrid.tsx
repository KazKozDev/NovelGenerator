import React from 'react';

const FeatureGrid: React.FC = () => {
  const features = [
    {
      icon: '🤖',
      title: 'AI-Powered Editing',
      description: 'Intelligent agents analyze and refine each chapter with targeted edits, regeneration, and professional polish.'
    },
    {
      icon: '📝',
      title: 'Visual Diff Viewer',
      description: 'See exactly what changed in real-time with side-by-side or unified diff views of all edits.'
    },
    {
      icon: '🎯',
      title: 'Multi-Pass Refinement',
      description: 'Three-level editing: individual chapters, continuity check, and professional polish for publication-ready quality.'
    },
    {
      icon: '📊',
      title: 'Agent Activity Logs',
      description: 'Track every decision, execution, and evaluation made by the AI agents during the writing process.'
    },
    {
      icon: '✨',
      title: 'Professional Polish',
      description: 'Final pass focused on rhythm, subtext, emotional anchors, and perception layers for professional-level prose.'
    },
    {
      icon: '🔄',
      title: 'Continuity Checking',
      description: 'Automated verification of character states, plot consistency, and smooth transitions between chapters.'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {features.map((feature, index) => (
        <div
          key={index}
          className="bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 rounded-lg p-5 hover:border-sky-500/50 hover:bg-slate-700/70 transition-all duration-300 group"
        >
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-300">
            {feature.icon}
          </div>
          <h3 className="text-sky-300 font-semibold text-base mb-2">
            {feature.title}
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            {feature.description}
          </p>
        </div>
      ))}
    </div>
  );
};

export default FeatureGrid;
