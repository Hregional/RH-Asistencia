import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TurnosService, Turno } from '../../services/turnos.service';
import { NgxMaterialTimepickerModule } from 'ngx-material-timepicker';

@Component({
    selector: 'app-gestion-turnos',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, NgxMaterialTimepickerModule],
    templateUrl: './gestion-turnos.component.html',
    styleUrls: ['./gestion-turnos.component.scss']
})
export class GestionTurnosComponent implements OnInit {
    turnos: Turno[] = [];
    turnoForm: FormGroup;
    isEditing = false;
    currentTurnoId: number | null = null;
    loading = false;
    showForm = false;

    constructor(
        private turnosService: TurnosService,
        private fb: FormBuilder
    ) {
        this.turnoForm = this.fb.group({
            nombre_turno: ['', Validators.required],
            tipo: ['ROTATIVO', Validators.required],
            hora_inicio: ['', Validators.required],
            hora_fin: ['', Validators.required],
            tolerancia_entrada_minutos: [15, [Validators.required, Validators.min(0)]],
            tolerancia_salida_minutos: [15, [Validators.required, Validators.min(0)]]
        });
    }

    ngOnInit(): void {
        this.loadTurnos();
    }

    loadTurnos() {
        this.loading = true;
        this.turnosService.getTurnos().subscribe({
            next: (res) => {
                if (res.success) {
                    this.turnos = res.data;
                }
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                alert('No se pudieron cargar los turnos');
                this.loading = false;
            }
        });
    }

    showCreateForm() {
        this.resetForm();
        this.showForm = true;
    }

    cancelForm() {
        this.showForm = false;
        this.resetForm();
    }

    onSubmit() {
        if (this.turnoForm.invalid) return;

        const formData = this.turnoForm.value;
        this.loading = true;

        if (this.isEditing && this.currentTurnoId) {
            this.turnosService.updateTurno(this.currentTurnoId, formData).subscribe({
                next: (res) => {
                    if (res.success) {
                        alert('Turno actualizado correctamente');
                        this.showForm = false;
                        this.resetForm();
                        this.loadTurnos();
                    }
                },
                error: (err) => {
                    alert('Error al actualizar turno');
                    this.loading = false;
                }
            });
        } else {
            this.turnosService.createTurno(formData).subscribe({
                next: (res) => {
                    if (res.success) {
                        alert('Turno creado correctamente');
                        this.showForm = false;
                        this.resetForm();
                        this.loadTurnos();
                    }
                },
                error: (err) => {
                    alert('Error al crear turno');
                    this.loading = false;
                }
            });
        }
    }

    editTurno(turno: Turno) {
        this.isEditing = true;
        this.currentTurnoId = turno.id;
        this.showForm = true;
        this.turnoForm.patchValue({
            nombre_turno: turno.nombre_turno,
            tipo: turno.tipo_turno || 'ROTATIVO', // Map backend tipo_turno to frontend tipo
            hora_inicio: turno.hora_inicio,
            hora_fin: turno.hora_fin,
            tolerancia_entrada_minutos: turno.tolerancia_entrada_minutos,
            tolerancia_salida_minutos: turno.tolerancia_salida_minutos
        });
    }

    deleteTurno(id: number) {
        if (confirm('¿Estás seguro de eliminar este turno? No podrás revertir esto.')) {
            this.turnosService.eliminarTurno(id).subscribe({
                next: (res) => {
                    alert('El turno ha sido eliminado.');
                    this.loadTurnos();
                },
                error: (err) => {
                    alert('No se pudo eliminar el turno');
                }
            });
        }
    }

    resetForm() {
        this.isEditing = false;
        this.currentTurnoId = null;
        this.turnoForm.reset({
            tipo: 'ROTATIVO',
            tolerancia_entrada_minutos: 15,
            tolerancia_salida_minutos: 15
        });
    }
}
