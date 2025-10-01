import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, RotateCcw, Info } from 'lucide-react';

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  isUser?: boolean;
}

interface Edge {
  source: string;
  target: string;
  weight: number;
}

const GraphView: React.FC = () => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showLegend, setShowLegend] = useState(false);

  // Mock graph data
  const nodes: Node[] = [
    { id: 'user', label: 'Вы', x: 400, y: 300, radius: 25, color: '#16a34a', isUser: true },
    { id: '1', label: 'Анна', x: 300, y: 200, radius: 20, color: '#22c55e' },
    { id: '2', label: 'Михаил', x: 500, y: 180, radius: 18, color: '#22c55e' },
    { id: '3', label: 'Елена', x: 250, y: 350, radius: 22, color: '#f59e0b' },
    { id: '4', label: 'Дмитрий', x: 550, y: 320, radius: 16, color: '#f59e0b' },
    { id: '5', label: 'Ольга', x: 350, y: 420, radius: 19, color: '#bc7f4f' },
    { id: '6', label: 'Игорь', x: 480, y: 420, radius: 17, color: '#bc7f4f' },
  ];

  const edges: Edge[] = [
    { source: 'user', target: '1', weight: 0.95 },
    { source: 'user', target: '2', weight: 0.88 },
    { source: 'user', target: '3', weight: 0.82 },
    { source: 'user', target: '4', weight: 0.76 },
    { source: 'user', target: '5', weight: 0.74 },
    { source: '1', target: '3', weight: 0.65 },
    { source: '2', target: '4', weight: 0.58 },
    { source: '3', target: '5', weight: 0.72 },
    { source: '5', target: '6', weight: 0.69 },
  ];

  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply transforms
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Draw edges
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.strokeStyle = `rgba(100, 116, 139, ${edge.weight})`;
        ctx.lineWidth = edge.weight * 4;
        ctx.stroke();
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();
      
      // Border for user node
      if (node.isUser) {
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = '#374151';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x, node.y + node.radius + 15);
    });

    ctx.restore();
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - offset.x) / zoom;
    const y = (event.clientY - rect.top - offset.y) / zoom;

    // Check if click is on a node
    const clickedNode = nodes.find(node => {
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      return distance <= node.radius;
    });

    setSelectedNode(clickedNode || null);
  };

  const handleZoomIn = () => setZoom(Math.min(zoom * 1.2, 3));
  const handleZoomOut = () => setZoom(Math.max(zoom / 1.2, 0.5));
  const handleCenter = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    drawGraph();
  }, [zoom, offset, selectedNode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 800;
    canvas.height = 600;
    drawGraph();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4 border-b">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            {t('graph.title')}
          </h1>
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center space-x-2"
          >
            <Info className="w-4 h-4" />
            <span>{t('graph.legend')}</span>
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Graph Canvas */}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full bg-white cursor-pointer"
          style={{ height: 'calc(100vh - 120px)' }}
        />

        {/* Controls */}
        <div className="absolute top-4 right-4 flex flex-col space-y-2">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-white shadow-md rounded-lg hover:bg-gray-50 transition-colors"
            title={t('graph.zoom_in')}
          >
            <ZoomIn className="w-5 h-5 text-gray-700" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-white shadow-md rounded-lg hover:bg-gray-50 transition-colors"
            title={t('graph.zoom_out')}
          >
            <ZoomOut className="w-5 h-5 text-gray-700" />
          </button>
          <button
            onClick={handleCenter}
            className="p-2 bg-white shadow-md rounded-lg hover:bg-gray-50 transition-colors"
            title={t('graph.center')}
          >
            <RotateCcw className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* Node Info Panel */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 bg-white shadow-lg rounded-lg p-4 max-w-xs">
            <h3 className="font-semibold text-gray-900 mb-2">
              {selectedNode.label}
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              {selectedNode.isUser 
                ? 'Это вы! Центр вашей сети связей.'
                : 'Нажмите, чтобы посмотреть профиль и начать общение.'
              }
            </p>
            {!selectedNode.isUser && (
              <div className="flex space-x-2">
                <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors">
                  Профиль
                </button>
                <button className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition-colors">
                  Чат
                </button>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {showLegend && (
          <div className="absolute top-4 left-4 bg-white shadow-lg rounded-lg p-4 max-w-sm">
            <h3 className="font-semibold text-gray-900 mb-3">{t('graph.legend')}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-forest-600 rounded-full" />
                <span>Вы (центральный узел)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-forest-500 rounded-full" />
                <span>Высокое совпадение (90%+)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-warm-500 rounded-full" />
                <span>Среднее совпадение (70-89%)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-earth-500 rounded-full" />
                <span>Новые связи (50-69%)</span>
              </div>
              <div className="mt-3 pt-2 border-t">
                <p className="text-xs text-gray-600">
                  {t('graph.node_size')} • {t('graph.line_thickness')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphView;