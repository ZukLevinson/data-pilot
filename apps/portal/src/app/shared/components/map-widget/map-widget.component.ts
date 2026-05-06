import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild, AfterViewInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { EntitySearchResult } from '@org/models';
import { parse } from 'wellknown';

import { Map, GeoJSON, LatLngExpression } from 'leaflet';

@Component({
  selector: 'app-map-widget',
  standalone: true,
  imports: [CommonModule],
  template: `<div #mapContainer class="map-container"></div>`,
  styles: [`
    .map-container {
      height: 100%;
      width: 100%;
      border-radius: 0;
      margin: 0;
      border: none;
      z-index: 1;
    }
  `]
})
export class MapWidgetComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() sources: EntitySearchResult[] = [];
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  private platformId = inject(PLATFORM_ID);
  private map?: Map;
  private L?: typeof import('leaflet');
  private geoJsonLayer?: GeoJSON;

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initMap();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['sources'] && this.map && isPlatformBrowser(this.platformId)) {
      this.updateLayers();
    }
  }

  ngOnDestroy() {
    if (this.map && isPlatformBrowser(this.platformId)) {
      this.map.remove();
    }
  }

  private async initMap() {
    if (this.map) return;

    this.L = await import('leaflet');
    const L = this.L;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [31.5, 34.75], // Default center (Israel)
      zoom: 7,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
    
    this.updateLayers();
  }

  public zoomToEntity(id: string) {
    if (!this.map || !this.geoJsonLayer) return;
    
    const layers = (this.geoJsonLayer as any).getLayers();
    const targetLayer = layers.find((l: any) => l.feature?.properties?.id === id);
    
    if (targetLayer) {
      if (targetLayer.getBounds) {
        this.map.fitBounds(targetLayer.getBounds(), { padding: [50, 50], maxZoom: 15 });
      } else if (targetLayer.getLatLng) {
        this.map.setView(targetLayer.getLatLng(), 15);
      }
      targetLayer.openPopup();
    }
  }

  private updateLayers() {
    if (!this.map || !this.L) {
      console.log('Map or Leaflet not ready for updateLayers');
      return;
    }
    const L = this.L;

    if (this.geoJsonLayer) {
      this.map.removeLayer(this.geoJsonLayer);
    }

    const geoJsonFeatures: any[] = [];

    this.sources.forEach(source => {
      if (source.wkt) {
        try {
          const geoJson = parse(source.wkt);
          if (geoJson) {
            geoJsonFeatures.push({
              type: 'Feature',
              properties: {
                id: source.id,
                name: source.name,
                type: source.type,
                color: source.color,
                content: source.content
              },
              geometry: geoJson
            });
          }
        } catch (e) {
          console.error('Failed to parse WKT:', source.wkt, e);
        }
      }
    });

    if (geoJsonFeatures.length > 0) {
      this.geoJsonLayer = L.geoJSON(geoJsonFeatures, {
        onEachFeature: (feature: any, layer: any) => {
          const props = feature.properties;
          layer.bindPopup(`
            <div style="font-family: 'Open Sans', sans-serif;">
              <strong style="color: #1e293b; font-size: 14px;">${props.name}</strong>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${props.type}</div>
              <p style="font-size: 12px; margin-top: 8px; color: #334155;">${props.content}</p>
            </div>
          `);
        },
        style: (feature: any) => {
          const properties = feature.properties;
          const type = properties.type;
          if (type === 'Mine') {
            return {
              color: '#1e3a8a',
              weight: 3,
              opacity: 1,
              fillColor: '#3b82f6',
              fillOpacity: 0.3,
            };
          } else if (type === 'DrillMission') {
            return {
              color: '#4c1d95',
              weight: 4,
              opacity: 1,
              fillColor: '#a855f7',
              fillOpacity: 0.5,
              dashArray: '5, 5'
            };
          }
          return {
            color: properties.color || '#3b82f6',
            weight: 2,
            opacity: 0.8,
            fillColor: properties.color || '#3b82f6',
            fillOpacity: 0.2,
          };
        },
        pointToLayer: (feature: any, latlng: any) => {
          const properties = feature.properties;
          const type = properties.type;
          
          if (type === 'Cluster') {
            const icon = L.divIcon({
              className: 'cluster-icon',
              html: `<div style="background-color: ${properties.color || '#f59e0b'}; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.3);"><i class="pi pi-database" style="font-size: 10px;"></i></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            return L.marker(latlng, { icon });
          }

          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: properties.color || '#3b82f6',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 1
          });
        }
      }).addTo(this.map);

      const bounds = this.geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        this.map.fitBounds(bounds, { padding: [20, 20] });
      }
    } else {
      this.geoJsonLayer = undefined;
    }
  }
}
