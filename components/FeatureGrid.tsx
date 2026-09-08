import React from 'react';

const FeatureGrid: React.FC = () => {
  const features = [
    {
      icon: '01',
      title: 'Crafted by specialists',
      description: 'Three LLM agents. Structure. Character. Scene. Each perfecting their art.'
    },
    {
      icon: '02',
      title: 'Precision architecture',
      description: 'Every element placed with purpose. Dialogue, action, atmosphere flow as one.'
    },
    {
      icon: '03',
      title: 'Flawless execution',
      description: 'Real-time quality checks. Tone consistency. Perfect balance. Zero compromise.'
    },
    {
      icon: '04',
      title: 'Infinite memory',
      description: 'Every character. Every thread. Every detail. Remembered. Always.'
    },
    {
      icon: '05',
      title: 'Seamless integration',
      description: 'No rough edges. No jarring transitions. Just smooth, natural storytelling.'
    },
    {
      icon: '06',
      title: 'Refined to perfection',
      description: 'Layer by layer. Pass by pass. Until every word feels exactly right.'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
      {features.map((feature, index) => (
        <div
          key={index}
          className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 transition-colors"
        >
          <div className="text-xs font-mono text-zinc-500 mb-2 uppercase tracking-wider">
            {feature.icon}
          </div>
          <h3 className="text-zinc-200 font-medium text-sm mb-1.5">
            {feature.title}
          </h3>
          <p className="text-zinc-400 text-xs leading-relaxed">
            {feature.description}
          </p>
        </div>
      ))}
    </div>
  );
};

export default FeatureGrid;
