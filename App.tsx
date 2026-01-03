
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Navigation, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Layers, 
  Volume2, 
  MapPin,
  Loader2,
  Beer,
  Car as CarIcon,
  Globe,
  LocateFixed,
  Map as MapPinIcon,
  Tent,
  Users,
  Navigation2,
  MapPinned,
  Timer,
  Menu,
  ChevronLeft,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { BusinessPoint, Location, TrackingPath, District, RouteHistory } from './types';
import { fetchNearbyBusinesses, speakStatus, getGeminiAI } from './services/geminiService';

// Fix for default marker icons in Leaflet with React
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const createCustomIcon = (color: string, iconHtml?: string) => L.divIcon({
  html: iconHtml || `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.4);"></div>`,
  className: 'custom-div-icon',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const LocationTracker: React.FC<{ onLocationUpdate: (loc: Location) => void, enabled: boolean }> = ({ onLocationUpdate, enabled }) => {
  const map = useMap();
  
  useMapEvents({
    locationfound(e) {
      if (enabled) onLocationUpdate({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  useEffect(() => {
    if (enabled) {
      map.locate({ watch: true, enableHighAccuracy: true });
    } else {
      map.stopLocate();
    }
  }, [map, enabled]);
  
  return null;
};

const MapController: React.FC<{ center?: Location }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], 15);
    }
  }, [center, map]);
  return null;
};

type ActiveTab = 'stops' | 'districts';

interface ActiveNavigation {
  target: District | BusinessPoint;
  distance: string;
  time: string;
  geometry: [number, number][];
}

export default function App() {
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [mapCenter, setMapCenter] = useState<Location | undefined>(undefined);
  const [trackingPath, setTrackingPath] = useState<TrackingPath[]>([]);
  const [businesses, setBusinesses] = useState<BusinessPoint[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [cityPopulation, setCityPopulation] = useState<string>('');
  const [cityName, setCityName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('stops');
  const [activeNavigation, setActiveNavigation] = useState<ActiveNavigation | null>(null);
  const [carRotation, setCarRotation] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchCitySuggestions = async (query: string) => {
    if (query.length < 3) return;
    try {
      const ai = getGeminiAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Sugira 5 nomes de cidades que começam com: "${query}". JSON: {"suggestions": ["Nome"]}`,
        config: { responseMimeType: "application/json" }
      });
      const result = JSON.parse(response.text || '{"suggestions":[]}');
      setCitySuggestions(result.suggestions || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (citySearchQuery && showSuggestions) fetchCitySuggestions(citySearchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [citySearchQuery]);

  const toggleNavigation = () => {
    if (isNavigating) {
      setIsNavigating(false);
      setTrackingPath([]);
      setActiveNavigation(null);
      speakStatus("Jornada finalizada.");
    } else {
      setIsNavigating(true);
      speakStatus("Jornada iniciada. Rastreamento ativo.");
    }
  };

  const fetchCityData = async (lat: number, lng: number, placeName: string) => {
    setIsLoading(true);
    try {
      const ai = getGeminiAI();
      const prompt = `Analise a região [${lat}, ${lng}] (${placeName}). Retorne JSON: { "cityName": "Nome", "cityPopulation": "X", "bars": [{"name": "X", "lat": v, "lng": v, "address": "X"}], "districts": [{"name": "X", "lat": v, "lng": v, "description": "X", "population": "X"}] } Mínimo 15 bares.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      const result = JSON.parse(response.text || '{"bars":[], "districts": []}');
      setCityName(result.cityName || placeName);
      setCityPopulation(result.cityPopulation || 'Não informado');
      setBusinesses(result.bars.map((b: any) => ({ ...b, id: Math.random().toString(36).substr(2, 9), status: 'pending' })));
      setDistricts(result.districts.map((d: any) => ({ ...d, id: Math.random().toString(36).substr(2, 9), covered: false })));
      speakStatus(`Carregado ${result.cityName}.`);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationUpdate = useCallback((loc: Location) => {
    if (currentLocation) {
        const dy = loc.lat - currentLocation.lat;
        const dx = loc.lng - currentLocation.lng;
        const angle = Math.atan2(dx, dy) * (180 / Math.PI);
        setCarRotation(angle);
    }
    setCurrentLocation(loc);
    if (isNavigating) {
      setTrackingPath(prev => [...prev, { timestamp: Date.now(), location: loc }]);
    }
  }, [currentLocation, isNavigating]);

  const handleStatusUpdate = async (id: string, status: 'success' | 'failure') => {
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    await speakStatus(status === 'success' ? "Registrado com sucesso." : "Falha registrada.");
  };

  const performCitySearch = async (forcedQuery?: string) => {
    const query = forcedQuery || citySearchQuery;
    if (!query) return;
    setIsLoading(true);
    setShowSuggestions(false);
    try {
      const ai = getGeminiAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Lat/Lng de: ${query}. JSON: {"lat": v, "lng": v}`,
        config: { responseMimeType: "application/json" }
      });
      const geo = JSON.parse(response.text || '{}');
      if (geo.lat && geo.lng) {
        setMapCenter({ lat: geo.lat, lng: geo.lng });
        await fetchCityData(geo.lat, geo.lng, query);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStreetRoute = async (start: Location, end: Location) => {
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`);
      const data = await response.json();
      if (data.routes?.[0]) {
        const route = data.routes[0];
        return {
          points: route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]),
          distance: (route.distance / 1000).toFixed(1) + ' km',
          time: Math.round(route.duration / 60) + ' min'
        };
      }
    } catch (e) { console.error(e); }
    return null;
  };

  const goToLocation = async (item: District | BusinessPoint) => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    if (!currentLocation) {
        setMapCenter({ lat: item.lat, lng: item.lng });
        return;
    }
    setIsLoading(true);
    const streetRoute = await fetchStreetRoute(currentLocation, { lat: item.lat, lng: item.lng });
    if (streetRoute) {
      setActiveNavigation({ target: item, distance: streetRoute.distance, time: streetRoute.time, geometry: streetRoute.points as [number, number][] });
      setMapCenter({ lat: item.lat, lng: item.lng });
      speakStatus(`Trajeto para ${item.name}: ${streetRoute.distance}.`);
    }
    setIsLoading(false);
  };

  const detectRealLocation = () => {
    if (!navigator.geolocation) return;
    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentLocation(loc);
        setMapCenter(loc);
        setIsDetecting(false);
        await fetchCityData(loc.lat, loc.lng, "Local Atual");
      },
      () => setIsDetecting(false),
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="flex flex-col h-dvh bg-slate-950 overflow-hidden relative">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 z-50">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-slate-800 rounded-lg text-white">
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-sm font-black text-white">RouteMaster Pro</h1>
          <p className="text-[8px] text-indigo-400 font-bold uppercase tracking-widest">{cityName || 'Sem Rota'}</p>
        </div>
        <button onClick={detectRealLocation} className="p-2 bg-indigo-600 rounded-lg text-white">
          <LocateFixed className="w-6 h-6" />
        </button>
      </header>

      {/* Sidebar Drawer */}
      <aside className={`
        fixed inset-y-0 left-0 z-[100] w-full max-w-[320px] md:max-w-[400px] md:relative
        bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:hidden'}
      `}>
        {/* Sidebar Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-xl"><Navigation className="text-white w-5 h-5" /></div>
              <h1 className="text-lg font-black text-white">RouteMaster</h1>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400">
              <ChevronLeft className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-3">
            <button onClick={detectRealLocation} disabled={isDetecting} className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-900/20">
              {isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
              MINHA POSIÇÃO
            </button>

            <div className="flex gap-2 relative">
              <input 
                type="text" placeholder="Buscar Cidade..."
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:outline-none"
                value={citySearchQuery}
                onChange={(e) => { setCitySearchQuery(e.target.value); setShowSuggestions(true); }}
                onKeyDown={(e) => e.key === 'Enter' && performCitySearch()}
              />
              <button onClick={() => performCitySearch()} disabled={isLoading} className="bg-indigo-600 p-2.5 rounded-xl text-white">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
              {showSuggestions && citySuggestions.length > 0 && (
                <div ref={suggestionsRef} className="absolute top-full left-0 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-[110] overflow-hidden">
                  {citySuggestions.map((s, i) => (
                    <button key={i} onClick={() => { setCitySearchQuery(s); performCitySearch(s); }} className="w-full text-left px-4 py-3 text-xs text-slate-300 hover:bg-slate-700 border-b border-slate-700/50 last:border-0">{s}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900">
          <button onClick={() => setActiveTab('stops')} className={`flex-1 py-3 text-[10px] font-black uppercase transition-all ${activeTab === 'stops' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-500'}`}>Bares / Pontos</button>
          <button onClick={() => setActiveTab('districts')} className={`flex-1 py-3 text-[10px] font-black uppercase transition-all ${activeTab === 'districts' ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5' : 'text-slate-500'}`}>Distritos</button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/20">
          {activeTab === 'stops' ? businesses.map((b) => (
            <div key={b.id} className={`p-4 rounded-xl bg-slate-800/40 border ${activeNavigation?.target.id === b.id ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-700/50'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex gap-3">
                  <div className="p-2 bg-slate-700/50 rounded-lg text-orange-400"><Beer className="w-4 h-4" /></div>
                  <div className="max-w-[150px]"><h4 className="text-sm font-bold text-white truncate">{b.name}</h4><p className="text-[10px] text-slate-500 truncate">{b.address}</p></div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleStatusUpdate(b.id, 'success')} className="flex-1 py-1.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white rounded-lg border border-emerald-600/20 text-[10px] font-bold">OK</button>
                <button onClick={() => handleStatusUpdate(b.id, 'failure')} className="flex-1 py-1.5 bg-rose-600/10 hover:bg-rose-700 text-rose-500 hover:text-white rounded-lg border border-rose-600/20 text-[10px] font-bold">FALHOU</button>
                <button onClick={() => goToLocation(b)} className="p-1.5 bg-indigo-600 text-white rounded-lg"><Navigation className="w-4 h-4" /></button>
              </div>
            </div>
          )) : districts.map((d) => (
            <div key={d.id} className={`p-4 rounded-xl bg-slate-800/40 border ${d.covered ? 'border-emerald-500/30' : 'border-slate-700/50'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex gap-3">
                  <div className="p-2 bg-slate-700/50 rounded-lg text-emerald-400"><Tent className="w-4 h-4" /></div>
                  <div><h4 className="text-sm font-bold text-white">{d.name}</h4><p className="text-[10px] text-slate-500">Distrito</p></div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">{d.description}</p>
              <button onClick={() => goToLocation(d)} className="w-full py-2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl border border-indigo-600/20 text-[10px] font-black">INICIAR TRAJETO</button>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-5 bg-slate-900 border-t border-slate-800">
          <button onClick={toggleNavigation} className={`w-full py-4 rounded-xl font-black uppercase text-sm shadow-xl ${isNavigating ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
            {isNavigating ? 'PARAR RASTREIO' : 'COMEÇAR JORNADA'}
          </button>
        </div>
      </aside>

      {/* Map Area */}
      <main className="flex-1 relative bg-slate-950 overflow-hidden">
        {/* Toggle Sidebar Button (Desktop) */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
          className="hidden md:flex absolute top-6 left-6 z-40 bg-slate-900 border border-slate-700 p-2 rounded-xl text-white shadow-2xl hover:bg-slate-800"
        >
          {isSidebarOpen ? <ChevronLeft className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        <MapContainer center={[-23.55, -46.63]} zoom={15} zoomControl={false} className="z-10 h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="map-tiles-dark grayscale brightness-75 contrast-125" />
          <LocationTracker onLocationUpdate={handleLocationUpdate} enabled={true} />
          <MapController center={mapCenter} />

          {activeNavigation?.geometry && (
             <Polyline positions={activeNavigation.geometry} color="#4f46e5" weight={8} opacity={0.8} lineCap="round" />
          )}

          {trackingPath.length > 0 && (
            <Polyline positions={trackingPath.map(tp => [tp.location.lat, tp.location.lng])} color="#10b981" weight={4} opacity={0.4} />
          )}

          {districts.map((d) => (
            <Marker key={d.id} position={[d.lat, d.lng]} icon={createCustomIcon(d.covered ? '#10b981' : activeNavigation?.target.id === d.id ? '#6366f1' : '#334155')} />
          ))}

          {businesses.map((b) => (
            <Marker key={b.id} position={[b.lat, b.lng]} icon={createCustomIcon(b.status === 'success' ? '#10b981' : b.status === 'failure' ? '#f43f5e' : activeNavigation?.target.id === b.id ? '#6366f1' : '#f97316')} />
          ))}

          {currentLocation && (
            <Marker position={[currentLocation.lat, currentLocation.lng]} icon={L.divIcon({
              html: `<div class="relative flex items-center justify-center" style="transform: rotate(${carRotation}deg)"><div class="absolute w-12 h-12 bg-indigo-500/30 rounded-full animate-ping"></div><div class="relative w-8 h-8 bg-indigo-600 border-2 border-white rounded-full shadow-2xl flex items-center justify-center"><div class="absolute -top-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-white"></div><div class="w-2.5 h-2.5 bg-white rounded-full"></div></div></div>`,
              className: 'user-marker', iconSize: [32, 32], iconAnchor: [16, 16]
            })} />
          )}
        </MapContainer>

        {/* Floating Navigation HUD */}
        {activeNavigation && (
          <div className="absolute top-4 md:top-6 left-1/2 -translate-x-1/2 z-[50] w-[90%] max-w-sm">
             <div className="bg-slate-900/95 backdrop-blur-xl border-2 border-indigo-500/50 p-3 md:p-4 rounded-3xl shadow-2xl flex items-center gap-3 md:gap-5">
                <div className="bg-indigo-600 p-3 md:p-4 rounded-2xl shadow-xl shadow-indigo-500/30">
                  <Navigation2 className="text-white w-5 h-5 md:w-7 md:h-7 rotate-45 animate-bounce" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h3 className="text-white font-black text-[10px] md:text-sm uppercase truncate leading-tight">{activeNavigation.target.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1">
                      <Timer className="w-3 h-3 text-indigo-400" />
                      <span className="text-[9px] md:text-xs font-black text-indigo-300">{activeNavigation.time}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPinned className="w-3 h-3 text-emerald-400" />
                      <span className="text-[9px] md:text-xs font-black text-emerald-300">{activeNavigation.distance}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setActiveNavigation(null)} className="bg-slate-800 p-2 md:p-3 rounded-full text-slate-400"><XCircle className="w-5 h-5" /></button>
             </div>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-[110] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-slate-900 p-6 md:p-8 rounded-3xl border border-indigo-500/20 shadow-2xl text-center space-y-4">
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <CarIcon className="absolute inset-0 m-auto w-6 h-6 text-indigo-400 animate-pulse" />
              </div>
              <h2 className="text-white font-black uppercase text-xs md:text-sm">Processando...</h2>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Drawer Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)} 
          className="md:hidden fixed inset-0 bg-black/60 z-[90] backdrop-blur-sm"
        />
      )}
    </div>
  );
}
