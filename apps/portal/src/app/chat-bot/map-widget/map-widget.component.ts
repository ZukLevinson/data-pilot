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
      height: 450px;
      width: 100%;
      border-radius: 12px;
      margin-top: 10px;
      border: 1px solid #e2e8f0;
      z-index: 1;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
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
    if (!this.map || !this.L) return;
    const L = this.L;

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
                type: source.type,
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
      this.geoJsonLayer = L.geoJSON(geoJsonFeatures as any, {
        style: (feature: any) => ({
          color: '#3b82f6',
          weight: 3,
          opacity: 0.8,
          fillOpacity: 0.2
        }),
        pointToLayer: (feature: any, latlng: any) => {
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: '#3b82f6',
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
    }
  }
}
