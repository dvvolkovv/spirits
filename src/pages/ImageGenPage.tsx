import React from 'react';
import ImageGenInterface from '../components/imagegen/ImageGenInterface';

const ImageGenPage: React.FC = () => {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ImageGenInterface />
    </div>
  );
};

export default ImageGenPage;
