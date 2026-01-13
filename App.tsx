
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Navigation, 
  XCircle, 
  Search, 
  Loader2,
  Beer,
  Car as CarIcon,
  LocateFixed,
  Tent,
  Navigation2,
  MapPinned,
  Timer,
  Menu,
  ChevronLeft,
  Users,
  Volume2,
  ArrowRight,
  Info,
  Moon,
  Sun,
  History,
  Map as MapIcon,
  Compass,
  Navigation as NavigationIcon
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { BusinessPoint, Location, TrackingPath, District } from './types';
import { speakStatus, getGeminiAI } from './services/geminiService';

// Coordenadas aproximadas de Tianguá, Ceará
const INITIAL_COORDS: Location = { lat: -3.7317, lng: -41.0004 };

const searchCache = new Map<string, any>();
const suggestionCache = new Map<string, string[]>();

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const createCustomIcon = (color: string, iconHtml?: string) => L.divIcon({
  html: iconHtml || `<div style="background-color: ${color}; width: 18px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);"></div>`,
  className: 'custom-div-icon',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
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

const MapController: React.FC<{ center?: Location, followUser: boolean, userLoc: Location | null }> = ({ center, followUser, userLoc }) => {
  const map = useMap();
  
  useEffect(() => {
    if (followUser && userLoc) {
      map.setView([userLoc.lat, userLoc.lng], 17, { animate: true });
    } else if (center) {
      map.setView([center.lat, center.lng], 16, { animate: true });
    }
  }, [center, map, followUser, userLoc]);
  
  return null;
};

type ActiveTab = 'stops' | 'districts';

interface ActiveNavigation {
  target: { name: string; id?: string; population?: string; type?: string; description?: string; lat: number; lng: number };
  distance: string;
  time: string;
  arrivalTime: string;
  geometry: [number, number][];
}

export default function App() {
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [mapCenter, setMapCenter] = useState<Location | undefined>(INITIAL_COORDS);
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
  const [activeTab, setActiveTab] = useState('stops' as ActiveTab);
  const [activeNavigation, setActiveNavigation] = useState<ActiveNavigation | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<any>(null);
  const [carRotation, setCarRotation] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [followUser, setFollowUser] = useState(false);
  
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCityData(INITIAL_COORDS.lat, INITIAL_COORDS.lng, "Tianguá, Ceará");
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsSidebarOpen(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchCitySuggestions = async (query: string) => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return;
    if (suggestionCache.has(q)) {
      setCitySuggestions(suggestionCache.get(q)!);
      return;
    }

    try {
      const ai = getGeminiAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `5 names of brazilian cities, districts or rural "sítios" near Tianguá/CE containing "${query}". JSON: {"s": ["Name"]}`,
        config: { responseMimeType: "application/json" }
      });
      const result = JSON.parse(response.text || '{"s":[]}');
      const suggestions = result.s || [];
      suggestionCache.set(q, suggestions);
      setCitySuggestions(suggestions);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (citySearchQuery && showSuggestions) fetchCitySuggestions(citySearchQuery);
    }, 200); 
    return () => clearTimeout(timer);
  }, [citySearchQuery]);

  const toggleNavigation = () => {
    if (isNavigating) {
      setIsNavigating(false);
      setActiveNavigation(null);
      setFollowUser(false);
      speakStatus("Navegação encerrada.");
    } else {
      setIsNavigating(true);
      setTrackingPath([]); 
      speakStatus("Modo rastreamento ativado.");
    }
  };

  const fetchCityData = async (lat: number, lng: number, placeName: string) => {
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (searchCache.has(cacheKey)) {
      applyCityData(searchCache.get(cacheKey), lat, lng, placeName);
      return;
    }

    setIsLoading(true);
    try {
      const ai = getGeminiAI();
      const prompt = `Location data [${lat}, ${lng}] (${placeName}). JSON: { "cityName": "X", "cityPopulation": "X habitantes", "bars": [{"name": "X", "lat": v, "lng": v, "address": "X"}], "districts": [{"name": "X", "lat": v, "lng": v, "description": "X", "population": "X habitantes"}] } Include local "sítios" and rural communities.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      
      const result = JSON.parse(response.text || '{"bars":[], "districts": []}');
      searchCache.set(cacheKey, result);
      applyCityData(result, lat, lng, placeName);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyCityData = (result: any, lat: number, lng: number, placeName: string) => {
    setCityName(result.cityName || placeName);
    setCityPopulation(result.cityPopulation || 'População sob consulta');
    setBusinesses(result.bars.map((b: any) => ({ ...b, id: Math.random().toString(36).substr(2, 9), status: 'pending' })));
    setDistricts(result.districts.map((d: any) => ({ ...d, id: Math.random().toString(36).substr(2, 9), covered: false })));
    setSelectedPoint({ name: result.cityName || placeName, lat, lng, population: result.cityPopulation, type: 'city' });
    speakStatus(`${result.cityName}. ${result.cityPopulation}.`);
  };

  const handleLocationUpdate = useCallback((loc: Location) => {
    if (currentLocation) {
        const dy = loc.lat - currentLocation.lat;
        const dx = loc.lng - currentLocation.lng;
        if (Math.abs(dy) > 0.000005 || Math.abs(dx) > 0.000005) {
          const angle = Math.atan2(dx, dy) * (180 / Math.PI);
          setCarRotation(angle);
          
          setTrackingPath(prev => {
            const last = prev[prev.length - 1];
            if (!last || Math.abs(last.location.lat - loc.lat) > 0.00005 || Math.abs(last.location.lng - loc.lng) > 0.00005) {
              return [...prev, { timestamp: Date.now(), location: loc }];
            }
            return prev;
          });
        }
    }
    setCurrentLocation(loc);
  }, [currentLocation]);

  const handleStatusUpdate = async (id: string, status: 'success' | 'failure') => {
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    speakStatus(status === 'success' ? "Confirmado." : "Erro.");
  };

  const performCitySearch = async (forcedQuery?: string) => {
    const query = (forcedQuery || citySearchQuery).trim();
    if (!query) return;
    
    const cacheKey = `geo:${query.toLowerCase()}`;
    if (searchCache.has(cacheKey)) {
      const geo = searchCache.get(cacheKey);
      setMapCenter(geo);
      fetchCityData(geo.lat, geo.lng, query);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    setShowSuggestions(false);
    try {
      const ai = getGeminiAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Coords of ${query} in Ceará. JSON: {"lat": v, "lng": v}`,
        config: { responseMimeType: "application/json" }
      });
      const geo = JSON.parse(response.text || '{}');
      if (geo.lat && geo.lng) {
        searchCache.set(cacheKey, geo);
        setMapCenter(geo);
        fetchCityData(geo.lat, geo.lng, query);
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
        const durationSeconds = route.duration;
        const arrivalDate = new Date(Date.now() + durationSeconds * 1000);
        const arrivalTimeStr = arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return {
          points: route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]),
          distance: (route.distance / 1000).toFixed(1) + ' km',
          time: Math.round(route.duration / 60) + ' min',
          arrivalTime: arrivalTimeStr
        };
      }
    } catch (e) { console.error(e); }
    return null;
  };

  const goToLocation = async (item: any) => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    setSelectedPoint(null);
    if (!currentLocation) {
        setMapCenter({ lat: item.lat, lng: item.lng });
        return;
    }
    setIsLoading(true);
    const streetRoute = await fetchStreetRoute(currentLocation, { lat: item.lat, lng: item.lng });
    if (streetRoute) {
      setActiveNavigation({ 
        target: { name: item.name, id: item.id, population: item.population, type: item.type, description: item.description, lat: item.lat, lng: item.lng }, 
        distance: streetRoute.distance, 
        time: streetRoute.time, 
        arrivalTime: streetRoute.arrivalTime,
        geometry: streetRoute.points as [number, number][] 
      });
      setMapCenter({ lat: item.lat, lng: item.lng });
      setIsNavigating(true);
      setFollowUser(true);
      speakStatus(`Iniciando navegação para ${item.name}.`);
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
        fetchCityData(loc.lat, loc.lng, "Local");
      },
      () => setIsDetecting(false),
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className={`flex flex-col h-dvh overflow-hidden relative font-sans transition-colors duration-500 ${isDarkMode ? 'bg-[#1a1a1a] text-white' : 'bg-[#f8f9fb] text-slate-800'}`}>
      
      {/* Search Header - Minimalist Style (Hidden during active navigation) */}
      {!activeNavigation && (
        <div className="absolute top-0 left-0 w-full z-[120] px-4 py-3 md:px-8 md:py-6 flex flex-col items-center">
          <div className={`w-full max-w-2xl flex items-center gap-3 p-2 rounded-[2rem] shadow-2xl transition-all duration-300 ${isDarkMode ? 'bg-[#2d2d2d]' : 'bg-white'}`}>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-3 text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="flex-1 relative">
              <input 
                type="text" 
                placeholder="Pesquisar em Rotas Bets..."
                className={`w-full bg-transparent border-none py-3 text-lg font-bold focus:ring-0 placeholder:text-slate-400 ${isDarkMode ? 'text-white' : 'text-slate-700'}`}
                value={citySearchQuery}
                onChange={(e) => { setCitySearchQuery(e.target.value); setShowSuggestions(true); }}
                onKeyDown={(e) => e.key === 'Enter' && performCitySearch()}
              />
              {showSuggestions && citySuggestions.length > 0 && (
                <div ref={suggestionsRef} className={`absolute top-full left-0 w-full mt-4 rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-[130] overflow-hidden animate-in fade-in slide-in-from-top-2 border-t ${isDarkMode ? 'bg-[#2d2d2d] border-white/5' : 'bg-white border-slate-50'}`}>
                  {citySuggestions.map((s, i) => (
                    <button key={i} onClick={() => { setCitySearchQuery(s); performCitySearch(s); }} className={`w-full text-left px-8 py-5 text-base font-bold transition-colors flex items-center gap-4 ${isDarkMode ? 'hover:bg-white/5 text-white/80' : 'hover:bg-slate-50 text-slate-600'}`}>
                      <MapPinned className="w-5 h-5 text-blue-500" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 pr-1">
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
                {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
              </button>
              <div className="h-8 w-px bg-slate-100 mx-1"></div>
              <button onClick={detectRealLocation} className="p-3 text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
                <LocateFixed className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Google Maps Inspired Drawer */}
      <aside className={`
        fixed inset-y-0 left-0 z-[140] w-full max-w-[340px] md:max-w-[380px]
        flex flex-col transition-transform duration-500 ease-out shadow-3xl
        ${isDarkMode ? 'bg-[#1a1a1a]' : 'bg-white'}
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-8 pb-4">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-3 rounded-2xl shadow-xl shadow-blue-500/30">
                <Navigation className="text-white w-7 h-7" />
              </div>
              <div>
                <h1 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Rotas Bets</h1>
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Enterprise GPS</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-all">
              <ChevronLeft className="w-8 h-8" />
            </button>
          </div>

          {cityName && (
            <div className={`p-5 rounded-[2rem] border transition-all mb-6 ${isDarkMode ? 'bg-[#2d2d2d] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl shadow-sm ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-white text-blue-500'}`}>
                  <Users className="w-6 h-6" />
                </div>
                <div className="overflow-hidden">
                  <h2 className={`text-lg font-black uppercase truncate ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>{cityName}</h2>
                  <p className="text-sm font-bold text-blue-500">{cityPopulation}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-6">
            <button onClick={() => setActiveTab('stops')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'stops' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : isDarkMode ? 'bg-[#2d2d2d] text-white/40' : 'bg-slate-100 text-slate-400'}`}>Pontos</button>
            <button onClick={() => setActiveTab('districts')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'districts' ? 'bg-green-600 text-white shadow-lg shadow-green-500/30' : isDarkMode ? 'bg-[#2d2d2d] text-white/40' : 'bg-slate-100 text-slate-400'}`}>Distritos</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-8">
          {activeTab === 'stops' ? businesses.map((b) => (
            <div key={b.id} onClick={() => setSelectedPoint(b)} className={`p-5 rounded-[2rem] border-2 transition-all cursor-pointer group ${selectedPoint?.id === b.id ? 'border-blue-500 scale-[1.02]' : isDarkMode ? 'bg-[#2d2d2d] border-white/5 hover:border-white/20' : 'bg-white border-slate-50 shadow-sm hover:border-blue-100'}`}>
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-4 rounded-2xl transition-colors ${selectedPoint?.id === b.id ? 'bg-blue-600 text-white' : isDarkMode ? 'bg-white/5 text-blue-400' : 'bg-blue-50 text-blue-500'}`}>
                  <Beer className="w-6 h-6" />
                </div>
                <div className="overflow-hidden">
                  <h4 className={`text-base font-black leading-tight mb-1 truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{b.name}</h4>
                  <p className="text-[11px] font-bold text-slate-400 line-clamp-1">{b.address}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); handleStatusUpdate(b.id, 'success'); }} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-600'}`}>OK</button>
                <button onClick={(e) => { e.stopPropagation(); handleStatusUpdate(b.id, 'failure'); }} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-600'}`}>ERRO</button>
                <button onClick={(e) => { e.stopPropagation(); goToLocation(b); }} className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 active:scale-90"><Navigation className="w-5 h-5" /></button>
              </div>
            </div>
          )) : districts.map((d) => (
            <div key={d.id} onClick={() => setSelectedPoint(d)} className={`p-5 rounded-[2rem] border-2 transition-all cursor-pointer ${selectedPoint?.id === d.id ? 'border-blue-500 bg-blue-500/5' : isDarkMode ? 'bg-[#2d2d2d] border-white/5' : 'bg-white border-slate-50 shadow-sm'}`}>
              <div className="flex items-start gap-4 mb-4">
                <div className="p-4 bg-green-500 text-white rounded-2xl shadow-lg shadow-green-500/20"><Tent className="w-6 h-6" /></div>
                <div className="overflow-hidden">
                  <h4 className={`text-base font-black leading-tight truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{d.name}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] font-black text-green-500 uppercase">{d.population}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 mb-4 line-clamp-2 italic opacity-80">"{d.description}"</p>
              <button onClick={(e) => { e.stopPropagation(); goToLocation(d); }} className="w-full py-4 bg-blue-600 text-white rounded-[1.5rem] text-[11px] font-black tracking-widest uppercase shadow-xl shadow-blue-500/20 active:scale-95">IR PARA O LOCAL</button>
            </div>
          ))}
        </div>

        <div className={`p-8 border-t ${isDarkMode ? 'bg-[#1a1a1a] border-white/5' : 'bg-white border-slate-50'}`}>
          <button onClick={toggleNavigation} className={`w-full py-6 rounded-[2.5rem] font-black uppercase text-base tracking-widest shadow-[0_20px_40px_rgba(0,0,0,0.15)] transition-all active:scale-95 flex items-center justify-center gap-4 ${isNavigating ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
            {isNavigating ? <XCircle className="w-7 h-7" /> : <Navigation className="w-7 h-7" />}
            {isNavigating ? 'PARAR RASTREIO' : 'INICIAR TRABALHO'}
          </button>
        </div>
      </aside>

      {/* Map View */}
      <main className="flex-1 relative overflow-hidden">
        <MapContainer center={[INITIAL_COORDS.lat, INITIAL_COORDS.lng]} zoom={16} zoomControl={false} className="z-10 h-full w-full">
          <TileLayer 
            url={isDarkMode 
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            } 
            attribution='&copy; Rotas Bets Map'
          />
          <LocationTracker onLocationUpdate={handleLocationUpdate} enabled={true} />
          <MapController center={mapCenter} followUser={followUser} userLoc={currentLocation} />

          {/* Rastro de Percurso Persistente - LINHA CONTÍNUA E NÃO PONTILHADA */}
          {trackingPath.length > 0 && (
            <Polyline 
              positions={trackingPath.map(tp => [tp.location.lat, tp.location.lng])} 
              color="#3b82f6" 
              weight={8} 
              opacity={0.6} 
              lineCap="round" 
            />
          )}

          {/* Rota Ativa de Navegação - LINHA CONTÍNUA */}
          {activeNavigation?.geometry && (
             <>
               <Polyline positions={activeNavigation.geometry} color={isDarkMode ? "#ffffff" : "#ffffff"} weight={18} opacity={0.3} lineCap="round" />
               <Polyline positions={activeNavigation.geometry} color="#2563eb" weight={12} opacity={1} lineCap="round" className="navigation-active-line" />
             </>
          )}

          {districts.map((d) => (
            <Marker key={d.id} position={[d.lat, d.lng]} eventHandlers={{ click: () => setSelectedPoint(d) }} icon={createCustomIcon(selectedPoint?.id === d.id ? '#2563eb' : '#4b4b4b')} />
          ))}

          {businesses.map((b) => (
            <Marker key={b.id} position={[b.lat, b.lng]} eventHandlers={{ click: () => setSelectedPoint(b) }} icon={createCustomIcon(b.status === 'success' ? '#10b981' : b.status === 'failure' ? '#ef4444' : selectedPoint?.id === b.id ? '#2563eb' : '#3b82f6')} />
          ))}

          {currentLocation && (
            <Marker position={[currentLocation.lat, currentLocation.lng]} icon={L.divIcon({
              html: `
                <div class="relative flex items-center justify-center transition-all duration-300" style="transform: rotate(${carRotation}deg)">
                  <div class="absolute w-24 h-24 bg-blue-500/10 rounded-full animate-ping"></div>
                  <div class="relative w-12 h-12 bg-blue-600 border-[5px] border-white rounded-full shadow-[0_15px_40px_rgba(37,99,235,0.4)] flex items-center justify-center overflow-visible">
                    <div class="absolute -top-3 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-b-[20px] border-b-white"></div>
                    <div class="w-4 h-4 bg-white rounded-full"></div>
                  </div>
                </div>
              `,
              className: 'waze-car-pointer', iconSize: [48, 48], iconAnchor: [24, 24]
            })} />
          )}
        </MapContainer>

        {/* Selected Point Bottom Sheet - Mobile Style */}
        {selectedPoint && !activeNavigation && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[150] w-[94%] max-w-lg animate-in slide-in-from-bottom-10 duration-500">
            <div className={`p-8 rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.3)] border-t-8 border-blue-600 ${isDarkMode ? 'bg-[#2d2d2d]' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-5 overflow-hidden">
                  <div className={`p-5 rounded-3xl shadow-xl shrink-0 ${selectedPoint.type === 'city' ? 'bg-blue-600 text-white' : 'bg-green-500 text-white'}`}>
                    {selectedPoint.type === 'city' ? <MapIcon className="w-10 h-10" /> : <MapPinned className="w-10 h-10" />}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className={`text-2xl font-black leading-none mb-2 truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{selectedPoint.name}</h3>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-500" />
                      <p className="text-base font-black text-blue-500 tracking-wide">{selectedPoint.population || 'Clique para ver'}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedPoint(null)} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
                  <XCircle className="w-10 h-10" />
                </button>
              </div>
              
              {selectedPoint.description && (
                <p className={`text-sm mb-6 font-medium italic opacity-60 ${isDarkMode ? 'text-white' : 'text-slate-600'}`}>"{selectedPoint.description}"</p>
              )}

              <div className="flex gap-4">
                 <button 
                  onClick={() => goToLocation(selectedPoint)} 
                  className="flex-1 py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black text-xl tracking-[0.1em] shadow-2xl shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                  IR AGORA <Navigation2 className="w-7 h-7 rotate-45" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Navigation HUD (Top and Bottom) */}
        {activeNavigation && (
          <>
            {/* Top Instruction Card */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[160] w-[94%] max-w-2xl animate-in slide-in-from-top-10 duration-500">
               <div className="bg-blue-600 p-6 md:p-8 rounded-[2.5rem] shadow-[0_25px_60px_rgba(0,0,0,0.3)] flex items-center gap-6">
                  <div className="bg-white/20 p-5 rounded-3xl shadow-inner backdrop-blur-sm">
                    <NavigationIcon className="text-white w-10 h-10" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-white/70 text-sm font-black uppercase tracking-widest mb-1">Seguir para</p>
                    <h3 className="text-white font-black text-xl md:text-3xl uppercase truncate leading-tight tracking-tight">{activeNavigation.target.name}</h3>
                  </div>
                  <button onClick={() => { setActiveNavigation(null); setFollowUser(false); }} className="p-3 text-white/50 hover:text-white transition-colors">
                    <XCircle className="w-10 h-10" />
                  </button>
               </div>
            </div>

            {/* Bottom Progress Card (Google Maps Style) */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[160] w-[94%] max-w-xl animate-in slide-in-from-bottom-10 duration-500">
              <div className={`p-8 rounded-[3rem] shadow-[0_-15px_60px_rgba(0,0,0,0.2)] flex items-center justify-between border-b-[12px] border-blue-600 ${isDarkMode ? 'bg-[#2d2d2d]' : 'bg-white'}`}>
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-3xl font-black text-green-500">{activeNavigation.time}</span>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                    <span className="text-xl font-bold text-slate-400">{activeNavigation.distance}</span>
                  </div>
                  <p className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    Chegada às {activeNavigation.arrivalTime} <div className="w-1 h-1 bg-slate-300 rounded-full"></div> <Timer className="w-4 h-4" />
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button onClick={() => setFollowUser(true)} className={`p-5 rounded-full shadow-lg transition-all active:scale-90 ${followUser ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-600'}`}>
                    <Compass className={`w-8 h-8 ${followUser ? 'animate-pulse' : ''}`} />
                  </button>
                  <button onClick={() => { setActiveNavigation(null); setFollowUser(false); }} className="p-5 bg-red-100 text-red-600 rounded-full shadow-lg hover:bg-red-200 transition-all active:scale-90 font-black uppercase text-sm px-8">
                    Sair
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Global Loading */}
        {isLoading && (
          <div className="absolute inset-0 z-[200] bg-black/40 backdrop-blur-md flex items-center justify-center">
            <div className={`p-16 rounded-[4rem] shadow-[0_50px_150px_rgba(0,0,0,0.5)] text-center space-y-10 max-w-xs animate-in zoom-in-95 duration-500 ${isDarkMode ? 'bg-[#2d2d2d]' : 'bg-white'}`}>
              <div className="relative mx-auto w-32 h-32">
                <div className="absolute inset-0 border-[10px] border-blue-500/10 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <CarIcon className="w-16 h-16 text-blue-600 animate-bounce" />
                </div>
              </div>
              <div className="space-y-3">
                <h2 className={`font-black uppercase text-xl tracking-[0.2em] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Rotas Bets</h2>
                <p className="text-sm font-bold text-blue-500">Sincronizando Localidades...</p>
              </div>
            </div>
          </div>
        )}

        {/* Floating Controls (Recent Location) */}
        {!activeNavigation && (
          <div className="absolute bottom-10 right-10 z-[110] flex flex-col gap-6">
            <button onClick={() => setIsSidebarOpen(true)} className={`p-6 rounded-full shadow-3xl border-none transition-all active:scale-90 ${isDarkMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}>
              <History className="w-8 h-8" />
            </button>
          </div>
        )}
      </main>

      {/* Overlay mobile */}
      {isSidebarOpen && (
        <div onClick={() => setIsSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/60 z-[130] backdrop-blur-md transition-opacity duration-500" />
      )}
    </div>
  );
}
