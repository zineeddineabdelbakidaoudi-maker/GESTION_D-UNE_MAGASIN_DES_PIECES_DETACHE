pub mod commands;
pub mod db;

use db::{init_db, DbState};
use std::sync::Mutex;

pub fn run() {
    let conn = init_db();

    tauri::Builder::default()
        .manage(DbState {
            conn: Mutex::new(conn),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_trial_status,
            commands::get_metadata,
            commands::get_products,
            commands::create_product,
            commands::get_stock,
            commands::adjust_stock,
            commands::transfer_stock,
            commands::get_stock_movements,
            commands::create_sale,
            commands::get_sales,
            commands::process_return,
            commands::create_purchase,
            commands::get_purchases,
            commands::get_clients,
            commands::create_client,
            commands::create_client_versement,
            commands::get_client_transactions,
            commands::get_suppliers,
            commands::create_supplier,
            commands::create_supplier_versement,
            commands::get_supplier_transactions,
            commands::get_reports,
            commands::get_settings,
            commands::save_settings,
            commands::print_receipt,
            commands::get_printers,
            commands::update_product,
            commands::get_expense_categories,
            commands::get_depenses,
            commands::create_depense,
            commands::delete_depense,
            commands::get_depenses_total,
            commands::get_shortcuts,
            commands::save_shortcuts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
