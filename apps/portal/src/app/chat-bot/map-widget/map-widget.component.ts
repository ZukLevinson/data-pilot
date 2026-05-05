import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild, AfterViewInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { EntitySearchResult } from '@org/models';
import { parse } from 'wellknown';

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
  private map?: any;
  private L?: any;
  private geoJsonLayer?: any;

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

  private updateLayers() {
    if (!this.map || !this.L) {
      console.log('Map or Leaflet not ready for updateLayers');
      return;
    }
    const L = this.L;

    console.log(`Updating map with ${this.sources.length} sources`);

    if (this.geoJsonLayer) {
      this.map.removeLayer(this.geoJsonLayer);
    }

    const geoJsonFeatures: any[] = [];

    this.sources.forEach(source => {
      if (source.wkt) {
        try {
          const geoJson: any = parse(source.wkt);
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
      } else {
        console.warn('Source missing WKT:', source);
      }
    });

    if (geoJsonFeatures.length > 0) {
      console.log(`Adding ${geoJsonFeatures.length} features to map`);
      this.geoJsonLayer = L.geoJSON(geoJsonFeatures as any, {
        style: (feature: any) => {
          const type = feature.properties.type;
          if (type === 'Mine') {
            return {
              color: '#1e3a8a',
              weight: 4,
              opacity: 1,
              fillColor: '#3b82f6',
              fillOpacity: 0.4,
            };
          } else if (type === 'Mission') {
            return {
              color: '#4c1d95', // Deep Violet border
              weight: 5,
              opacity: 1,
              fillColor: '#a855f7', // Bright Violet fill
              fillOpacity: 0.7,
              dashArray: '6, 4' // Dashed border to indicate "active operation"
            };
          }
          return {
            color: feature.properties.color || '#3b82f6',
            weight: 1,
            opacity: 0.6,
            fillColor: feature.properties.color || '#3b82f6',
            fillOpacity: 0.2,
          };
        },
        pointToLayer: (feature: any, latlng: any) => {
          const type = feature.properties.type;
          
          if (type === 'Cluster') {
            const icon = L.divIcon({
              className: 'cluster-icon',
              html: `
                <div style="
                  background-color: ${feature.properties.color || '#f59e0b'};
                  color: white;
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border: 2px solid white;
                  box-shadow: 0 0 10px rgba(0,0,0,0.4);
                ">
                  <i class="pi pi-database" style="font-size: 12px;"></i>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });
            return L.marker(latlng, { icon });
          }

          return L.circleMarker(latlng, {
            radius: 8,
            fillColor: feature.properties.color || '#3b82f6',
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
      console.warn('No GeoJSON features generated from sources');
    }
  }
}
