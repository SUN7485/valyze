"""
Performance monitoring for Valyze extraction pipeline.
Tracks timing and resource usage for optimization.
"""

import time
import psutil
import threading
from typing import Dict, List, Optional
from datetime import datetime

class PerformanceMonitor:
    """Monitors performance metrics during extraction."""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._metrics = {}
                cls._instance._current_report_id = None
            return cls._instance
    
    def start_monitoring(self, report_id: str):
        """Start monitoring for a specific report."""
        self._current_report_id = report_id
        self._metrics[report_id] = {
            'start_time': time.time(),
            'file_times': {},
            'memory_usage': [],
            'cpu_usage': [],
            'errors': [],
            'file_count': 0,
            'total_pages': 0,
            'ocr_pages': 0
        }
        print(f"[PERF] Started monitoring for report {report_id}")
    
    def record_file_start(self, filename: str):
        """Record start of file processing."""
        if self._current_report_id and self._current_report_id in self._metrics:
            self._metrics[self._current_report_id]['file_times'][filename] = {
                'start': time.time(),
                'end': None,
                'pages': 0,
                'ocr_pages': 0
            }
    
    def record_file_end(self, filename: str, pages: int, ocr_pages: int = 0):
        """Record end of file processing."""
        if (self._current_report_id and 
            self._current_report_id in self._metrics and
            filename in self._metrics[self._current_report_id]['file_times']):
            
            self._metrics[self._current_report_id]['file_times'][filename]['end'] = time.time()
            self._metrics[self._current_report_id]['file_times'][filename]['pages'] = pages
            self._metrics[self._current_report_id]['file_times'][filename]['ocr_pages'] = ocr_pages
            self._metrics[self._current_report_id]['file_count'] += 1
            self._metrics[self._current_report_id]['total_pages'] += pages
            self._metrics[self._current_report_id]['ocr_pages'] += ocr_pages
    
    def record_metrics_sample(self):
        """Record current CPU and memory usage."""
        if self._current_report_id and self._current_report_id in self._metrics:
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            cpu_percent = process.cpu_percent(interval=0.1)
            
            self._metrics[self._current_report_id]['memory_usage'].append({
                'timestamp': time.time(),
                'memory_mb': memory_mb
            })
            
            self._metrics[self._current_report_id]['cpu_usage'].append({
                'timestamp': time.time(),
                'cpu_percent': cpu_percent
            })
    
    def record_error(self, error_message: str):
        """Record an error that occurred during processing."""
        if self._current_report_id and self._current_report_id in self._metrics:
            self._metrics[self._current_report_id]['errors'].append({
                'timestamp': time.time(),
                'message': error_message
            })
    
    def get_summary(self, report_id: str) -> Dict:
        """Get performance summary for a report."""
        if report_id not in self._metrics:
            return {}
        
        metrics = self._metrics[report_id]
        end_time = time.time()
        total_time = end_time - metrics['start_time']
        
        # Calculate file processing times
        file_times = []
        for filename, file_data in metrics['file_times'].items():
            if file_data['end']:
                duration = file_data['end'] - file_data['start']
                file_times.append({
                    'filename': filename,
                    'duration_seconds': round(duration, 2),
                    'pages': file_data['pages'],
                    'ocr_pages': file_data['ocr_pages']
                })
        
        # Calculate average memory and CPU
        avg_memory = 0
        avg_cpu = 0
        if metrics['memory_usage']:
            avg_memory = sum(m['memory_mb'] for m in metrics['memory_usage']) / len(metrics['memory_usage'])
        if metrics['cpu_usage']:
            avg_cpu = sum(c['cpu_percent'] for c in metrics['cpu_usage']) / len(metrics['cpu_usage'])
        
        return {
            'report_id': report_id,
            'total_time_seconds': round(total_time, 2),
            'file_count': metrics['file_count'],
            'total_pages': metrics['total_pages'],
            'ocr_pages': metrics['ocr_pages'],
            'avg_memory_mb': round(avg_memory, 2),
            'avg_cpu_percent': round(avg_cpu, 2),
            'file_times': sorted(file_times, key=lambda x: x['duration_seconds'], reverse=True),
            'error_count': len(metrics['errors']),
            'start_time': datetime.fromtimestamp(metrics['start_time']).isoformat(),
            'end_time': datetime.fromtimestamp(end_time).isoformat()
        }
    
    def print_summary(self, report_id: str):
        """Print a human-readable performance summary."""
        summary = self.get_summary(report_id)
        if not summary:
            print(f"[PERF] No performance data for report {report_id}")
            return
        
        print(f"\n{'='*60}")
        print(f"  PERFORMANCE SUMMARY — Report {report_id}")
        print(f"{'='*60}")
        print(f"  Total time: {summary['total_time_seconds']} seconds")
        print(f"  Files processed: {summary['file_count']}")
        print(f"  Total pages: {summary['total_pages']}")
        print(f"  OCR pages: {summary['ocr_pages']}")
        print(f"  Avg memory: {summary['avg_memory_mb']} MB")
        print(f"  Avg CPU: {summary['avg_cpu_percent']}%")
        print(f"  Errors: {summary['error_count']}")
        
        if summary['file_times']:
            print(f"\n  Slowest files:")
            for file_info in summary['file_times'][:3]:  # Top 3 slowest
                print(f"    {file_info['filename']}: {file_info['duration_seconds']}s "
                      f"({file_info['pages']} pages, {file_info['ocr_pages']} OCR)")
        
        print(f"{'='*60}\n")

# Global instance
performance_monitor = PerformanceMonitor()