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
